import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSqlite1763300000000 implements MigrationInterface {
  name = 'InitialSqlite1763300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" varchar PRIMARY KEY NOT NULL,
        "fullname" varchar NOT NULL,
        "email" varchar NOT NULL,
        "password" varchar NOT NULL,
        "address" varchar,
        "type" varchar CHECK("type" IN ('patient','doctor','family')) NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "status" varchar CHECK("status" IN ('ACTIVE','INACTIVE','DELETED')) NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "doctors" (
        "id" varchar PRIMARY KEY NOT NULL,
        "specialty" varchar,
        "licenseNumber" varchar,
        "userId" varchar,
        CONSTRAINT "REL_doctors_user" UNIQUE ("userId"),
        CONSTRAINT "FK_doctors_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "patients" (
        "id" varchar PRIMARY KEY NOT NULL,
        "userId" varchar,
        CONSTRAINT "REL_patients_user" UNIQUE ("userId"),
        CONSTRAINT "FK_patients_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "family_members" (
        "id" varchar PRIMARY KEY NOT NULL,
        "userId" varchar,
        CONSTRAINT "REL_family_user" UNIQUE ("userId"),
        CONSTRAINT "FK_family_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "family_patients" (
        "familyMembersId" varchar NOT NULL,
        "patientsId" varchar NOT NULL,
        CONSTRAINT "PK_family_patients" PRIMARY KEY ("familyMembersId", "patientsId"),
        CONSTRAINT "FK_family_patients_family" FOREIGN KEY ("familyMembersId") REFERENCES "family_members" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_family_patients_patient" FOREIGN KEY ("patientsId") REFERENCES "patients" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id" varchar PRIMARY KEY NOT NULL,
        "startedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "endedAt" datetime,
        "deviceId" varchar NOT NULL,
        "patientId" varchar,
        CONSTRAINT "FK_sessions_patient" FOREIGN KEY ("patientId") REFERENCES "patients" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "session_data" (
        "id" varchar PRIMARY KEY NOT NULL,
        "pulse" integer NOT NULL,
        "oxygenSaturation" integer NOT NULL,
        "temperatureC" float NOT NULL,
        "systolic" integer NOT NULL,
        "diastolic" integer NOT NULL,
        "ambientTemperatureC" float,
        "fingerDetected" boolean NOT NULL DEFAULT (0),
        "monitoringEnabled" boolean NOT NULL DEFAULT (0),
        "calibrationComplete" boolean NOT NULL DEFAULT (0),
        "respirationDetected" boolean NOT NULL DEFAULT (0),
        "respirationMissing" boolean NOT NULL DEFAULT (0),
        "warningActive" boolean NOT NULL DEFAULT (0),
        "alertActive" boolean NOT NULL DEFAULT (0),
        "recordedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "sessionId" varchar,
        CONSTRAINT "FK_session_data_session" FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "session_data"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP TABLE "family_patients"`);
    await queryRunner.query(`DROP TABLE "family_members"`);
    await queryRunner.query(`DROP TABLE "patients"`);
    await queryRunner.query(`DROP TABLE "doctors"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
