using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Milepoint.Api.Data.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class AddMilestoneParent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ParentWorkItemId",
                table: "Milestones",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Milestones_ParentWorkItemId",
                table: "Milestones",
                column: "ParentWorkItemId");

            migrationBuilder.AddForeignKey(
                name: "FK_Milestones_WorkItems_ParentWorkItemId",
                table: "Milestones",
                column: "ParentWorkItemId",
                principalTable: "WorkItems",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Milestones_WorkItems_ParentWorkItemId",
                table: "Milestones");

            migrationBuilder.DropIndex(
                name: "IX_Milestones_ParentWorkItemId",
                table: "Milestones");

            migrationBuilder.DropColumn(
                name: "ParentWorkItemId",
                table: "Milestones");
        }
    }
}
