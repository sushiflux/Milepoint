using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Milepoint.Api.Data.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class ProjectCategoriesAndColumnVisibility : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Category used to be an enum stored as an int (0 Feature, 1 Bug, 2 Chore). It becomes
            // the NAME of a per-project category, so existing cards keep their category: rename the
            // old column, add the text column, convert the values, drop the old column. (A plain
            // AlterColumn would fail on Postgres and could not map the values.)
            migrationBuilder.RenameColumn(
                name: "Category",
                table: "WorkItems",
                newName: "CategoryOld");

            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "WorkItems",
                type: "character varying(60)",
                maxLength: 60,
                nullable: true);

            migrationBuilder.Sql(
                "UPDATE \"WorkItems\" SET \"Category\" = CASE \"CategoryOld\" WHEN 0 THEN 'Feature' WHEN 1 THEN 'Bug' WHEN 2 THEN 'Chore' ELSE NULL END WHERE \"CategoryOld\" IS NOT NULL;");

            migrationBuilder.DropColumn(
                name: "CategoryOld",
                table: "WorkItems");

            // Every column that exists today is one of the built-in ones (nothing could add custom
            // columns before), so existing rows start as IsDefault = true.
            migrationBuilder.AddColumn<bool>(
                name: "IsDefault",
                table: "BoardColumns",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsHidden",
                table: "BoardColumns",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "ProjectCategories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Color = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    IsDefault = table.Column<bool>(type: "boolean", nullable: false),
                    IsHidden = table.Column<bool>(type: "boolean", nullable: false),
                    Order = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectCategories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectCategories_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectCategories_ProjectId_Name",
                table: "ProjectCategories",
                columns: new[] { "ProjectId", "Name" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProjectCategories");

            migrationBuilder.DropColumn(
                name: "IsDefault",
                table: "BoardColumns");

            migrationBuilder.DropColumn(
                name: "IsHidden",
                table: "BoardColumns");

            // Back to the enum int; custom category names have no enum value and become NULL.
            migrationBuilder.RenameColumn(
                name: "Category",
                table: "WorkItems",
                newName: "CategoryText");

            migrationBuilder.AddColumn<int>(
                name: "Category",
                table: "WorkItems",
                type: "integer",
                nullable: true);

            migrationBuilder.Sql(
                "UPDATE \"WorkItems\" SET \"Category\" = CASE \"CategoryText\" WHEN 'Feature' THEN 0 WHEN 'Bug' THEN 1 WHEN 'Chore' THEN 2 ELSE NULL END WHERE \"CategoryText\" IS NOT NULL;");

            migrationBuilder.DropColumn(
                name: "CategoryText",
                table: "WorkItems");
        }
    }
}
