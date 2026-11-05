import { prisma } from "./prisma";

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();

    await prisma.$queryRaw`SELECT 1`;

    console.log("PostgreSQL connected successfully");
  } catch (error) {
    console.error("PostgreSQL connection failed:", error);

    throw error;
  }
}
