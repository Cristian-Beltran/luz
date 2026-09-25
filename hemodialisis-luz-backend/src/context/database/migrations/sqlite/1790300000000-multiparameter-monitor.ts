import { MigrationInterface, QueryRunner } from 'typeorm';

export class MultiparameterMonitor1790300000000 implements MigrationInterface {
  name = 'MultiparameterMonitor1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "session_data" DROP COLUMN "oxygenSaturation"`);
    await queryRunner.query(
      `ALTER TABLE "session_data" ADD COLUMN "respiratoryRateBpm" float NOT NULL DEFAULT (0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD COLUMN "ultrafiltrationGoalLiters" float`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD COLUMN "ultrafiltrationActualLiters" float`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD COLUMN "pressureIntervalMinutes" integer NOT NULL DEFAULT (30)`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD COLUMN "lastPressureAt" datetime`,
    );
    await queryRunner.query(`
      CREATE TABLE "session_events" (
        "id" varchar PRIMARY KEY NOT NULL,
        "type" varchar NOT NULL,
        "source" varchar NOT NULL,
        "description" text NOT NULL,
        "metadata" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "sessionId" varchar,
        CONSTRAINT "FK_session_events_session" FOREIGN KEY ("sessionId")
          REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "session_events"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "lastPressureAt"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "pressureIntervalMinutes"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "ultrafiltrationActualLiters"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "ultrafiltrationGoalLiters"`);
    await queryRunner.query(`ALTER TABLE "session_data" DROP COLUMN "respiratoryRateBpm"`);
    await queryRunner.query(
      `ALTER TABLE "session_data" ADD COLUMN "oxygenSaturation" integer NOT NULL DEFAULT (0)`,
    );
  }
}
