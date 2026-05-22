import { SpecialistServer } from "@consilium/specialist-sdk";

new SpecialistServer({
  name: "security",
  version: "0.1.0",
  description: "Reviews code for security vulnerabilities, OWASP risks, and secure coding patterns",
}).start();
