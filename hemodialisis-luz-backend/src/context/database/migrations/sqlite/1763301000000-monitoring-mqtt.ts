import { MigrationInterface, QueryRunner } from 'typeorm';

export class MonitoringMqtt1763301000000 implements MigrationInterface {
  name = 'MonitoringMqtt1763301000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD COLUMN "deviceId" varchar NOT NULL DEFAULT ''`,
    );

    await queryRunner.query(
      `ALTER TABLE "session_data" ADD COLUMN "ambientTemperatureC" float`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_data" ADD COLUMN "fingerDetected" boolean NOT NULL DEFAULT (0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_data" ADD COLUMN "monitoringEnabled" boolean NOT NULL DEFAULT (0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_data" ADD COLUMN "calibrationComplete" boolean NOT NULL DEFAULT (0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_data" ADD COLUMN "respirationDetected" boolean NOT NULL DEFAULT (0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_data" ADD COLUMN "respirationMissing" boolean NOT NULL DEFAULT (0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_data" ADD COLUMN "warningActive" boolean NOT NULL DEFAULT (0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_data" ADD COLUMN "alertActive" boolean NOT NULL DEFAULT (0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "session_data" DROP COLUMN "alertActive"`);
    await queryRunner.query(
      `ALTER TABLE "session_data" DROP COLUMN "warningActive"`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_data" DROP COLUMN "respirationMissing"`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_data" DROP COLUMN "respirationDetected"`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_data" DROP COLUMN "calibrationComplete"`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_data" DROP COLUMN "monitoringEnabled"`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_data" DROP COLUMN "fingerDetected"`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_data" DROP COLUMN "ambientTemperatureC"`,
    );
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "deviceId"`);
  }
}
