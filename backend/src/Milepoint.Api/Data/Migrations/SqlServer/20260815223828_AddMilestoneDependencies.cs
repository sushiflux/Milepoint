using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Milepoint.Api.Data.Migrations.SqlServer
{
    /// <inheritdoc />
    public partial class AddMilestoneDependencies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MilestoneDependencies",
                columns: table => new
                {
                    MilestoneId = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    WorkItemId = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Direction = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MilestoneDependencies", x => new { x.MilestoneId, x.WorkItemId });
                    table.ForeignKey(
                        name: "FK_MilestoneDependencies_Milestones_MilestoneId",
                        column: x => x.MilestoneId,
                        principalTable: "Milestones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MilestoneDependencies_WorkItems_WorkItemId",
                        column: x => x.WorkItemId,
                        principalTable: "WorkItems",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_MilestoneDependencies_WorkItemId",
                table: "MilestoneDependencies",
                column: "WorkItemId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MilestoneDependencies");
        }
    }
}
