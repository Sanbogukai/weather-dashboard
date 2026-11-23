-- CreateEnum
CREATE TYPE "CardSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- CreateTable
CREATE TABLE "Owner" (
    "id" SERIAL NOT NULL,
    "key" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favourite" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "placeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "country" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "timezone" TEXT NOT NULL,
    "size" "CardSize" NOT NULL DEFAULT 'MEDIUM',
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favourite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Owner_key_key" ON "Owner"("key");

-- CreateIndex
CREATE INDEX "Favourite_ownerId_position_idx" ON "Favourite"("ownerId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Favourite_ownerId_placeId_key" ON "Favourite"("ownerId", "placeId");

-- AddForeignKey
ALTER TABLE "Favourite" ADD CONSTRAINT "Favourite_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
