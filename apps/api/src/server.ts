import app from "./app.js";
import { prisma } from "./lib/prisma.js";

const PORT = 3000;

try {
    await prisma.$connect();
    console.log("Prisma Connected!");
    app.listen(PORT, () => {
        console.log("API is listening on port: ", PORT);
    });
} catch (error) {
    console.log("Error starting the server!: ", error);
    await prisma.$disconnect();
    process.exit(1);
}
