require("dotenv").config();
const http = require("http");
const app = require("./app");
const { initSocket } = require("./config/socket");

const port = process.env.PORT || 3000;

const server = http.createServer(app);
initSocket(server);

server.listen(port, () => {
  console.log(`AtomQuest backend running on port ${port}`);
});
