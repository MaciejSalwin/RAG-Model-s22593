import "dotenv/config";
import app from "../../app.js";

const port = Number(process.env.PORT || 5050);

app.listen(port, () => {
  console.log("Server started");
});
