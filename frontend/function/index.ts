/* 最小占位函数：仅报告 DEEPSEEK_API_KEY 是否存在，绝不读取或回显其值。 */
Deno.serve(() => {
  const key = Deno.env.get("DEEPSEEK_API_KEY");
  const body = JSON.stringify({
    ok: true,
    deepseekKeyPresent: typeof key === "string" && key.length > 0,
  });
  return new Response(body, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
});