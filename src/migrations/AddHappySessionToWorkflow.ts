import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHappySessionToWorkflow1699345678901 implements MigrationInterface {
  name = 'AddHappySessionToWorkflow1699345678901';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add happyProcessId column
    await queryRunner.query(
      `ALTER TABLE "ticket_workflows" ADD "happyProcessId" integer`,
    );

    // Add happySessionMetadata column
    await queryRunner.query(
      `ALTER TABLE "ticket_workflows" ADD "happySessionMetadata" jsonb`,
    );

    // Update happySessionId column type from uuid to varchar
    await queryRunner.query(
      `ALTER TABLE "ticket_workflows" ALTER COLUMN "happySessionId" TYPE varchar`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert happySessionId column type
    await queryRunner.query(
      `ALTER TABLE "ticket_workflows" ALTER COLUMN "happySessionId" TYPE uuid USING "happySessionId"::uuid`,
    );

    // Drop happySessionMetadata column
    await queryRunner.query(
      `ALTER TABLE "ticket_workflows" DROP COLUMN "happySessionMetadata"`,
    );

    // Drop happyProcessId column
    await queryRunner.query(
      `ALTER TABLE "ticket_workflows" DROP COLUMN "happyProcessId"`,
    );
  }
}