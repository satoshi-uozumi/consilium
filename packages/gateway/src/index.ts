import { GatewayServer } from "./server.js";

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

new GatewayServer(port).start();