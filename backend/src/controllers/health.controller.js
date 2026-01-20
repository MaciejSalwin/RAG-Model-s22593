export async function healthCheck(request, response) {
  response.json({ status: "ok" });
}
