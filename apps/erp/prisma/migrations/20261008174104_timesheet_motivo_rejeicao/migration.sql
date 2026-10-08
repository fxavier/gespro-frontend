-- #167: rejeição de timesheet (molde de Ausencia). Preenchido => rejeitado, terminal.
ALTER TABLE "Timesheet" ADD COLUMN "motivoRejeicao" TEXT;
