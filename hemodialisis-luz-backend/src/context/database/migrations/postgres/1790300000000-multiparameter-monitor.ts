import { MigrationInterface, QueryRunner } from 'typeorm';

export class MultiparameterMonitor1790300000000 implements MigrationInterface {
  name = 'MultiparameterMonitor1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "session_data" DROP COLUMN "oxygenSaturation"`);
    await queryRunner.query(`ALTER TABLE "session_data" ADD "respiratoryRateBpm" double precision NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "sessions" ADD "ultrafiltrationGoalLiters" double precision`);
    await queryRunner.query(`ALTER TABLE "sessions" ADD "ultrafiltrationActualLiters" double precision`);
    await queryRunner.query(`ALTER TABLE "sessions" ADD "pressureIntervalMinutes" integer NOT NULL DEFAULT 30`);
    await queryRunner.query(`ALTER TABLE "sessions" ADD "lastPressureAt" TIMESTAMP`);
    await queryRunner.query(`CREATE TABLE "session_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" character varying NOT NULL, "source" character varying NOT NULL, "description" text NOT NULL, "metadata" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "sessionId" uuid, CONSTRAINT "PK_session_events" PRIMARY KEY ("id"))`);
    await queryRunner.query(`ALTER TABLE "session_events" ADD CONSTRAINT "FK_session_events_session" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "session_events"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "lastPressureAt"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "pressureIntervalMinutes"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "ultrafiltrationActualLiters"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "ultrafiltrationGoalLiters"`);
    await queryRunner.query(`ALTER TABLE "session_data" DROP COLUMN "respiratoryRateBpm"`);
    await queryRunner.query(`ALTER TABLE "session_data" ADD "oxygenSaturation" integer NOT NULL DEFAULT 0`);
  }
}
