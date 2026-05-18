import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1762066459698 implements MigrationInterface {
    name = 'Migration1762066459698'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "session_data" DROP CONSTRAINT "FK_3f0a377247128b3d22355f0bc0c"`);
        await queryRunner.query(`ALTER TABLE "sessions" DROP CONSTRAINT "FK_fd11aa87698d5a784713b9de978"`);
        await queryRunner.query(`ALTER TABLE "session_data" DROP COLUMN "lungCapacity"`);
        await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "deviceId"`);
        await queryRunner.query(`ALTER TABLE "session_data" ADD "temperatureC" double precision NOT NULL`);
        await queryRunner.query(`ALTER TABLE "session_data" ADD "systolic" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "session_data" ADD "diastolic" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "session_data" ADD CONSTRAINT "FK_3f0a377247128b3d22355f0bc0c" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "session_data" DROP CONSTRAINT "FK_3f0a377247128b3d22355f0bc0c"`);
        await queryRunner.query(`ALTER TABLE "session_data" DROP COLUMN "diastolic"`);
        await queryRunner.query(`ALTER TABLE "session_data" DROP COLUMN "systolic"`);
        await queryRunner.query(`ALTER TABLE "session_data" DROP COLUMN "temperatureC"`);
        await queryRunner.query(`ALTER TABLE "sessions" ADD "deviceId" uuid`);
        await queryRunner.query(`ALTER TABLE "session_data" ADD "lungCapacity" double precision NOT NULL`);
        await queryRunner.query(`ALTER TABLE "sessions" ADD CONSTRAINT "FK_fd11aa87698d5a784713b9de978" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "session_data" ADD CONSTRAINT "FK_3f0a377247128b3d22355f0bc0c" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
