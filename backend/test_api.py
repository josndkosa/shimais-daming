"""离线回归：stdlib unittest + ASGITransport/MockTransport，绝不读取 .env 或调用真实模型。"""

import asyncio
import importlib
import json
import os
from collections import deque
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
import unittest
from unittest.mock import patch

import httpx
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

# main 的常规启动仍可加载 .env；测试显式隔离真实密钥、来源配置和 dotenv 文件。
with patch("dotenv.load_dotenv"), patch.dict(os.environ, {}, clear=True):
    import main as api
import retriever

ROOT = Path(__file__).resolve().parent.parent
REAL_CLIENT = httpx.AsyncClient
BODY_LIMIT = 128 * 1024


def upstream_content(content):
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


def questions():
    dims = ["timeline"] * 4 + ["person"] * 3 + ["institution"] * 3
    return {"questions": [
        {"dim": dim, "stem": f"第{i + 1}题：海瑞买棺上疏的年份？",
         "options": ["1566", "1565", "1567", "1568"], "answer": 0,
         "explain": "1566年买棺上疏，反映谏诤的代价。", "sourceId": "hairui/c4",
         "source": "《不存在的史料·卷999》"}
        for i, dim in enumerate(dims)
    ]}


def review(correct=None, supported=True):
    return [{"correctOptions": [0] if correct is None else correct,
             "explanationSupported": supported} for _ in range(10)]


class APITests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        api._hits.clear()
        api._practice_hits.clear()
        retriever._cache.clear()
        self.calls = []
        self.responses = deque()
        self.client = REAL_CLIENT(transport=httpx.ASGITransport(app=api.app, raise_app_exceptions=False),
                                  base_url="http://test")
        self.addAsyncCleanup(self.client.aclose)
        self.enterContext(patch.dict(os.environ, {"DEEPSEEK_API_KEY": "offline-test-only"}))
        self.enterContext(patch.object(api.httpx, "AsyncClient", side_effect=self.model_client))

    def model_client(self, **kwargs):
        return REAL_CLIENT(transport=httpx.MockTransport(self.upstream), **kwargs)

    async def upstream(self, request):
        payload = json.loads(request.content)
        self.calls.append(payload)
        if self.responses:
            response = self.responses.popleft()
            if isinstance(response, BaseException):
                raise response
            return response
        rules = payload["messages"][0]["content"]
        if rules == api.PRACTICE_RULES:
            return upstream_content(json.dumps(questions(), ensure_ascii=False))
        if rules == api.CHECK_RULES:
            return upstream_content("")
        if payload["temperature"] == 0:
            return upstream_content(json.dumps(review()))
        return upstream_content("此事可据材料讨论。")

    async def chat(self, **updates):
        payload = {"figure": "hairui", "message": "海瑞买棺上疏", "history": []}
        payload.update(updates)
        return await self.client.post("/api/chat", json=payload)

    def assert_error(self, response, status, code):
        self.assertEqual(response.status_code, status, response.text)
        body = response.json()
        self.assertEqual(body.get("code"), code, body)
        self.assertIsInstance(body.get("detail"), str)
        self.assertTrue(body["detail"])
        return body

    async def test_T10_history_per_role_boundaries(self):
        for role, limit in [("user", 500), ("assistant", 2000)]:
            for char in ["史", "a"]:
                with self.subTest(role=role, char=char):
                    self.assertEqual((await self.chat(history=[{"role": role, "content": char * limit}])).status_code, 200)
                    calls = len(self.calls)
                    self.assert_error(await self.chat(history=[{"role": role, "content": char * (limit + 1)}]),
                                      400, "invalid_input")
                    self.assertEqual(len(self.calls), calls)

    async def test_T11_history_entry_limit(self):
        history = [{"role": "user", "content": "问"}] * 19
        self.assertEqual((await self.chat(history=history)).status_code, 200)
        calls = len(self.calls)
        self.assert_error(await self.chat(history=history + history[:1]), 400, "invalid_input")
        self.assertEqual(len(self.calls), calls)

    async def test_T12_new_question_limits_without_model_calls(self):
        for text in ["", " \n\t", "中" * 501, "a" * 501]:
            with self.subTest(length=len(text)):
                self.assert_error(await self.chat(message=text), 400, "invalid_input")
        self.assertEqual(self.calls, [])
        self.assertEqual((await self.chat(message="中" * 500)).status_code, 200)

    async def test_T13_total_characters_include_new_question(self):
        for char in ["中", "a"]:
            with self.subTest(char=char):
                history = [{"role": "assistant", "content": char * 1950} for _ in range(10)]
                self.assertEqual((await self.chat(message=char * 500, history=history)).status_code, 200)
                calls = len(self.calls)
                history[-1]["content"] += char
                self.assert_error(await self.chat(message=char * 500, history=history), 400, "invalid_input")
                self.assertEqual(len(self.calls), calls)

    async def test_T13_actual_body_byte_limit_and_json_escaping(self):
        for char, escaped in [("a", False), ("中", False), ("中", True)]:
            raw = json.dumps({"figure": "hairui", "message": char * 500}, ensure_ascii=escaped).encode("utf-8")
            exact = raw + b" " * (BODY_LIMIT - len(raw))
            for length in [BODY_LIMIT - 1, BODY_LIMIT, BODY_LIMIT + 1]:
                with self.subTest(char=char, escaped=escaped, length=length):
                    data = exact[:length] if length <= BODY_LIMIT else exact + b" "
                    calls = len(self.calls)
                    result = await self.client.post("/api/chat", content=data, headers={"content-type": "application/json"})
                    if length <= BODY_LIMIT:
                        self.assertEqual(result.status_code, 200, result.text)
                    else:
                        self.assert_error(result, 413, "request_too_large")
                        self.assertEqual(len(self.calls), calls)

    async def test_T13_chunked_body_ignores_spoofed_content_length(self):
        for declared in [None, "1"]:
            async def chunks():
                yield b"{"  # 即使不是合法 JSON，也必须在解析前返回 413。
                yield b"x" * (BODY_LIMIT - 1)
                yield b"x"
            headers = {"content-type": "application/json", "origin": "http://localhost:5500"}
            if declared:
                headers["content-length"] = declared
            result = await self.client.post("/api/chat", content=chunks(), headers=headers)
            self.assert_error(result, 413, "request_too_large")
            self.assertEqual(result.headers.get("access-control-allow-origin"), "http://localhost:5500")
        self.assertEqual(self.calls, [])

    async def test_T13_large_history_is_rejected_before_model(self):
        history = [{"role": "assistant", "content": "x" * 100000}] * 19
        self.assert_error(await self.chat(history=history), 413, "request_too_large")
        self.assertEqual(self.calls, [])

    async def test_422_is_structured_without_echoing_body(self):
        secret = "PRIVATE-BODY-DO-NOT-ECHO"
        cases = [{"message": {"secret": secret}}, {"history": [{"role": secret, "content": secret}]},
                 {"history": None}, {"figure": []}]
        for updates in cases:
            with self.subTest(updates=updates):
                result = await self.chat(**updates)
                self.assert_error(result, 422, "validation_error")
                self.assertNotIn(secret, result.text)
        result = await self.client.post("/api/chat", content='{"message":"' + secret,
                                        headers={"content-type": "application/json"})
        self.assert_error(result, 422, "validation_error")
        self.assertNotIn(secret, result.text)
        self.assertEqual(self.calls, [])

    async def test_unknown_figure_and_route_are_structured(self):
        self.assert_error(await self.chat(figure="no-such-person"), 404, "not_found")
        self.assert_error(await self.client.get("/missing"), 404, "not_found")
        self.assertEqual(self.calls, [])

    async def test_T14_malformed_upstream_envelopes_do_not_retry(self):
        bad = [upstream_content(value) for value in [None, 123, [], {}, "", "  "]]
        bad += [httpx.Response(200, json=value) for value in
                [{}, [], {"choices": []}, {"choices": [None]}, {"choices": [{"message": {}}]}]]
        bad += [httpx.Response(200, text="not json"), httpx.Response(503, text="private upstream detail")]
        for route in ["/api/chat", "/api/quiz/practice"]:
            for response in bad:
                with self.subTest(route=route, response=response.content):
                    api._hits.clear()
                    api._practice_hits.clear()
                    self.responses.append(response)
                    count = len(self.calls)
                    result = await (self.chat() if route == "/api/chat" else self.client.post(route))
                    self.assert_error(result, 502, "upstream_error")
                    self.assertEqual(len(self.calls), count + 1)
                    self.assertNotIn("private upstream detail", result.text)

    async def test_memory_tier_and_topics_reach_the_system_prompt(self):
        response = await self.chat(memory={"tier": "相熟", "lastTopics": ["问过废相", "问过锦衣卫"]})
        self.assertEqual(response.status_code, 200, response.text)
        system = self.calls[0]["messages"][0]["content"]
        self.assertIn("此人此前曾与你交谈，谈及：问过废相、问过锦衣卫。", system)
        self.assertIn("此人现与你的交情是「相熟」", system)
        self.assertIn("史官校验规则不变。", system)

    async def test_memory_topics_are_truncated_and_capped(self):
        long = "问" * 120
        response = await self.chat(memory={"tier": "深谈", "lastTopics": [long, "第二问", "第三问", "第四问"]})
        self.assertEqual(response.status_code, 200, response.text)
        system = self.calls[0]["messages"][0]["content"]
        self.assertIn("问" * 50, system)
        self.assertNotIn("问" * 51, system)
        self.assertNotIn("第四问", system)

    async def test_invalid_memory_tier_is_ignored(self):
        response = await self.chat(memory={"tier": "挚友", "lastTopics": ["问过废相"]})
        self.assertEqual(response.status_code, 200, response.text)
        system = self.calls[0]["messages"][0]["content"]
        self.assertNotIn("此人此前曾与你交谈", system)

    async def test_chat_without_memory_keeps_the_prompt_unchanged(self):
        response = await self.chat()
        self.assertEqual(response.status_code, 200, response.text)
        system = self.calls[0]["messages"][0]["content"]
        self.assertNotIn("此人此前曾与你交谈", system)
        self.assertTrue(system.endswith(api.GENERAL_RULES))

    async def test_empty_chat_checker_is_valid(self):
        result = await self.chat()
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json(), {"reply": "此事可据材料讨论。", "note": None})
        self.assertEqual(len(self.calls), 2)

    async def test_network_timeout_and_review_errors_are_not_generation_failure(self):
        for route in ["/api/chat", "/api/quiz/practice"]:
            for error, status, code in [(httpx.ReadTimeout("private"), 504, "upstream_timeout"),
                                        (httpx.ConnectError("private"), 502, "upstream_error")]:
                for during_review in [False, True]:
                    with self.subTest(route=route, code=code, during_review=during_review):
                        api._hits.clear()
                        api._practice_hits.clear()
                        self.responses.clear()
                        if during_review:
                            self.responses.append(upstream_content("回复" if route == "/api/chat" else json.dumps(questions())))
                        self.responses.append(error)
                        count = len(self.calls)
                        result = await (self.chat() if route == "/api/chat" else self.client.post(route))
                        self.assert_error(result, status, code)
                        self.assertEqual(len(self.calls), count + 1 + int(during_review))
                        self.assertNotIn("private", result.text)

    async def test_material_files_missing_or_invalid_do_not_call_model(self):
        for error in [FileNotFoundError("private/path"), PermissionError("private/path"),
                      UnicodeError("bad encoding"), ValueError("bad JSON")]:
            for route in ["/api/chat", "/api/quiz/practice"]:
                with self.subTest(error=type(error).__name__, route=route):
                    api._practice_hits.clear()
                    retriever._cache.clear()
                    with patch.object(Path, "read_text", side_effect=error):
                        result = await (self.chat() if route == "/api/chat" else self.client.post(route))
                    self.assert_error(result, 503, "materials_unavailable")
                    self.assertNotIn("private/path", result.text)
        self.assertEqual(self.calls, [])

    async def test_invalid_material_structure_does_not_call_model(self):
        for content in ["{}", '{"chunks":[]}', '{"chunks":[{"id":"c1"}]}', '{"chunks":[null]}']:
            for route in ["/api/chat", "/api/quiz/practice"]:
                with self.subTest(content=content, route=route):
                    api._practice_hits.clear()
                    retriever._cache.clear()
                    with patch.object(Path, "read_text", return_value=content):
                        result = await (self.chat() if route == "/api/chat" else self.client.post(route))
                    self.assert_error(result, 503, "materials_unavailable")
        self.assertEqual(self.calls, [])

    async def test_T15_invalid_question_structures_never_escape(self):
        mutations = [{"dim": []}, {"dim": "other"}, {"stem": []}, {"stem": " "},
                     {"options": [[], "B", "C", "D"]}, {"options": ["A", " A ", "C", "D"]},
                     {"options": ["A", "B", "C"]}, {"options": ["A", None, "C", "D"]},
                     {"answer": True}, {"answer": 4}, {"answer": "0"}, {"explain": 5},
                     {"explain": " "}, {"sourceId": []}, {"sourceId": "unknown/c1"}]
        payloads = []
        for mutation in mutations:
            payload = questions()
            payload["questions"][0].update(mutation)
            payloads.append(payload)
        duplicate = questions()
        duplicate["questions"][1]["stem"] = " " + duplicate["questions"][0]["stem"] + " "
        payloads += [duplicate, [], {"questions": questions()["questions"][:9]}, {"questions": [None] * 10}]
        for payload in payloads:
            with self.subTest(payload=payload):
                api._practice_hits.clear()
                self.responses.clear()
                self.responses.extend([upstream_content(json.dumps(payload)) for _ in range(2)])
                count = len(self.calls)
                self.assert_error(await self.client.post("/api/quiz/practice"), 503, "generation_failed")
                self.assertEqual(len(self.calls), count + 2)

    async def test_T16_bad_generated_json_retries_once_then_recovers(self):
        self.responses.append(upstream_content("not JSON"))
        result = await self.client.post("/api/quiz/practice")
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(len(self.calls), 3)
        self.assertEqual(len(result.json()["questions"]), 10)

    async def test_T23_source_is_canonical_and_reviewer_gets_evidence(self):
        result = await self.client.post("/api/quiz/practice")
        self.assertEqual(result.status_code, 200, result.text)
        chunk = retriever._corpus("hairui")[0][3]
        for q in result.json()["questions"]:
            self.assertEqual(q["sourceId"], "hairui/c4")
            self.assertEqual(q["source"], chunk["source"])
        review_prompt = self.calls[1]["messages"][1]["content"]
        review_items = json.loads(review_prompt)
        self.assertEqual(len(review_items), 10)
        for item in review_items:
            self.assertEqual(item["material"]["id"], "hairui/c4")
            self.assertEqual(item["material"]["text"], chunk["text"])
            self.assertEqual(item["material"]["source"], chunk["source"])
            self.assertEqual(item["explain"], questions()["questions"][0]["explain"])
        self.assertNotIn("不存在的史料", review_prompt)

    async def test_T23_ambiguous_or_unsupported_or_malformed_reviews_rejected(self):
        verdicts = [review([0, 1]), review([]), review([1]), review(supported=False),
                    review([True]), review([0.0]), review(supported=1), review(supported="true"),
                    review()[:9], [0] * 10, {}, [None] * 10]
        for verdict in verdicts:
            with self.subTest(verdict=verdict):
                api._practice_hits.clear()
                self.responses.clear()
                for _ in range(2):
                    self.responses.extend([upstream_content(json.dumps(questions())), upstream_content(json.dumps(verdict))])
                self.assert_error(await self.client.post("/api/quiz/practice"), 503, "generation_failed")

    async def test_T22_six_attempts_count_success_and_failure_and_expire(self):
        for success in [True, False]:
            with self.subTest(success=success):
                api._practice_hits.clear()
                clock = self.enterContext(patch.object(api, "time"))
                clock.monotonic.return_value = 100.0
                for _ in range(6):
                    if not success:
                        self.responses.extend([upstream_content("bad JSON")] * 2)
                    result = await self.client.post("/api/quiz/practice")
                    self.assertEqual(result.status_code, 200 if success else 503, result.text)
                count = len(self.calls)
                result = await self.client.post("/api/quiz/practice")
                body = self.assert_error(result, 429, "rate_limited")
                self.assertEqual(body["retry_after"], 3600)
                self.assertEqual(result.headers.get("retry-after"), "3600")
                self.assertEqual(len(self.calls), count)
                # 聊天有独立额度。
                self.assertEqual((await self.chat()).status_code, 200)
                clock.monotonic.return_value = 3700.0
                self.assertEqual((await self.client.post("/api/quiz/practice")).status_code, 200)

    async def test_cancelled_practice_attempt_is_not_refunded(self):
        for _ in range(6):
            self.responses.append(asyncio.CancelledError())
            with self.assertRaises(asyncio.CancelledError):
                await self.client.post("/api/quiz/practice")
        count = len(self.calls)
        self.assert_error(await self.client.post("/api/quiz/practice"), 429, "rate_limited")
        self.assertEqual(len(self.calls), count)

    async def test_T28_forwarded_header_does_not_change_rate_identity(self):
        for i in range(6):
            self.responses.append(httpx.Response(503))
            self.assert_error(await self.client.post("/api/quiz/practice", headers={"x-forwarded-for": f"198.51.100.{i}"}),
                              502, "upstream_error")
        self.assert_error(await self.client.post("/api/quiz/practice", headers={"x-forwarded-for": "203.0.113.1"}),
                          429, "rate_limited")
        self.assertEqual(list(api._practice_hits), ["127.0.0.1"])

    async def test_T28_uvicorn_trusts_only_configured_proxy_hops(self):
        trusted_app = ProxyHeadersMiddleware(api.app, trusted_hosts=["10.0.0.1"])
        for peer, forwarded, expected in [
            ("198.51.100.9", "203.0.113.8", "198.51.100.9"),
            ("10.0.0.1", "203.0.113.8", "203.0.113.8"),
            # 可信代理追加真实来源后，客户端伪造的最左项不能覆盖最右非可信地址。
            ("10.0.0.1", "192.0.2.5, 198.51.100.9", "198.51.100.9"),
        ]:
            with self.subTest(peer=peer, forwarded=forwarded):
                api._practice_hits.clear()
                transport = httpx.ASGITransport(app=trusted_app, client=(peer, 2345))
                async with REAL_CLIENT(transport=transport, base_url="http://test") as client:
                    response = await client.post("/api/quiz/practice", headers={"x-forwarded-for": forwarded})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(list(api._practice_hits), [expected])

    async def test_chat_rate_has_retry_after(self):
        for _ in range(30):
            self.assertEqual((await self.chat()).status_code, 200)
        result = await self.chat()
        body = self.assert_error(result, 429, "rate_limited")
        self.assertGreater(body["retry_after"], 0)
        self.assertEqual(int(result.headers["retry-after"]), body["retry_after"])

    async def test_cors_defaults_local_only(self):
        for origin in ["http://localhost:5500", "http://127.0.0.1:5500", "http://localhost:5501", "http://127.0.0.1:5501"]:
            response = await self.client.get("/api/health", headers={"origin": origin})
            self.assertEqual(response.headers.get("access-control-allow-origin"), origin)
        response = await self.client.get("/api/health", headers={"origin": "https://untrusted.example"})
        self.assertNotIn("access-control-allow-origin", response.headers)

    async def test_followup_retrieval_uses_only_latest_user_context(self):
        history = [{"role": "user", "content": "清丈均赋"}, {"role": "assistant", "content": "旧回答"},
                   {"role": "user", "content": "海瑞买棺上疏入狱"}, {"role": "assistant", "content": "最新回答"}]
        with patch.object(retriever, "retrieve", wraps=retriever.retrieve) as retrieve:
            self.assertEqual((await self.chat(message="后来呢？", history=history)).status_code, 200)
        query = retrieve.call_args.args[1]
        self.assertIn("海瑞买棺上疏入狱", query)
        self.assertIn("后来呢", query)
        self.assertNotIn("清丈均赋", query)
        self.assertNotIn("最新回答", query)
        with patch.object(retriever, "retrieve", wraps=retriever.retrieve) as retrieve:
            self.assertEqual((await self.chat(message="清丈土地", history=history)).status_code, 200)
        self.assertEqual(retrieve.call_args.args[1], "清丈土地")


class RetrievalTests(unittest.TestCase):
    def setUp(self):
        retriever._cache.clear()

    def test_direct_fact(self):
        self.assertEqual(retriever.retrieve("hairui", "买棺上疏")[0]["id"], "c4")
        self.assertEqual(retriever.retrieve("zhangjuzheng", "一条鞭法")[0]["id"], "c4")

    def test_colloquial_synonym(self):
        self.assertIn("c4", [c["id"] for c in retriever.retrieve("hairui", "骂皇帝")])

    def test_zero_relevance_returns_no_arbitrary_material(self):
        for query in ["", "Python Kubernetes API", "咖啡披萨薯条"]:
            with self.subTest(query=query):
                self.assertEqual(retriever.retrieve("hairui", query), [])


class ExportTests(unittest.TestCase):
    def exporter(self):
        self.assertTrue((ROOT / "backend/export_materials.py").exists(), "缺少静态资料导出工具")
        return importlib.import_module("export_materials")

    def test_canonical_export_matches_all_six_files_and_preserves_metadata(self):
        exporter = self.exporter()
        self.assertTrue((ROOT / "frontend/materials.json").exists(), "缺少静态导出产物")
        actual = json.loads((ROOT / "frontend/materials.json").read_text(encoding="utf-8"))
        expected = exporter.canonical_materials()
        self.assertEqual(actual, expected)
        sources = actual["sources"]
        self.assertEqual(len(sources), len({s["id"] for s in sources}))
        self.assertEqual({s["figure"] for s in sources}, set(api.PRACTICE_FIGURES))
        for source in sources:
            figure, chunk_id = source["id"].split("/")
            raw = json.loads((ROOT / "backend/data" / (figure + ".json")).read_text(encoding="utf-8"))
            chunk = next(c for c in raw["chunks"] if c["id"] == chunk_id)
            defaults = {"kind": "现代转述", "locator": chunk["source"], "edition": "尚未登记所据版本",
                        "verification": "本站转述，原文及版本待核对"}
            for field, default in defaults.items():
                self.assertEqual(source[field], chunk.get(field, default))
            for field in ["title", "text", "source", "url"]:
                if field in chunk:
                    self.assertEqual(source[field], chunk[field])

    def test_check_detects_stale_export_without_writing(self):
        exporter = self.exporter()
        with patch.object(Path, "read_text", return_value='{"sources":[]}'), patch.object(Path, "write_text") as write:
            with patch.object(exporter, "canonical_materials", return_value={"sources": [{"id": "changed/c1"}]}):
                with redirect_stdout(StringIO()) as output:
                    self.assertEqual(exporter.main(["--check"]), 1)
                self.assertIn("已过期", output.getvalue())
            write.assert_not_called()


if __name__ == "__main__":
    unittest.main()
