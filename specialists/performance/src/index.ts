import { SpecialistServer } from "@consilium/specialist-sdk";

new SpecialistServer({
  name: "performance",
  version: "0.1.0",
  description: "Reviews code for performance bottlenecks, algorithmic complexity, and optimization opportunities",
}).start();
