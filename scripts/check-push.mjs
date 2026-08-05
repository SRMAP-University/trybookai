import pkg from "@prisma/client";
const { PrismaClient } = pkg;

const p = new PrismaClient();

const tokens = await p.devicePushToken.findMany({
  select: {
    id: true,
    userId: true,
    platform: true,
    updatedAt: true,
    token: true,
  },
  orderBy: { updatedAt: "desc" },
  take: 20,
});

console.log(
  JSON.stringify(
    {
      tokenCount: tokens.length,
      tokens: tokens.map((t) => ({
        userId: t.userId,
        platform: t.platform,
        updatedAt: t.updatedAt,
        tokenPrefix: `${t.token.slice(0, 24)}…`,
      })),
    },
    null,
    2
  )
);

await p.$disconnect();
