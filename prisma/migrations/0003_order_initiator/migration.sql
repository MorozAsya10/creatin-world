CREATE TYPE "OrderInitiator" AS ENUM ('CLIENT', 'CREATOR');

ALTER TABLE "Order"
ADD COLUMN "initiator" "OrderInitiator" NOT NULL DEFAULT 'CLIENT';
