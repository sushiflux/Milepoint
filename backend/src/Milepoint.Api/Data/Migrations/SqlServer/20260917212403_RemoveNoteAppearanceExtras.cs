using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Milepoint.Api.Data.Migrations.SqlServer
{
    /// <inheritdoc />
    public partial class RemoveNoteAppearanceExtras : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "NoteEdgeOverrides");

            migrationBuilder.DropColumn(
                name: "EdgeArrow",
                table: "Notes");

            migrationBuilder.DropColumn(
                name: "EdgeColor",
                table: "Notes");

            migrationBuilder.DropColumn(
                name: "EdgeStyle",
                table: "Notes");

            migrationBuilder.DropColumn(
                name: "EdgeWidth",
                table: "Notes");

            migrationBuilder.DropColumn(
                name: "Shape",
                table: "Notes");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "EdgeArrow",
                table: "Notes",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EdgeColor",
                table: "Notes",
                type: "nvarchar(9)",
                maxLength: 9,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "EdgeStyle",
                table: "Notes",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "EdgeWidth",
                table: "Notes",
                type: "float",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Shape",
                table: "Notes",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "NoteEdgeOverrides",
                columns: table => new
                {
                    SourceNoteId = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    TargetNoteId = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    ProjectId = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Color = table.Column<string>(type: "nvarchar(9)", maxLength: 9, nullable: true),
                    Width = table.Column<double>(type: "float", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NoteEdgeOverrides", x => new { x.SourceNoteId, x.TargetNoteId });
                    table.ForeignKey(
                        name: "FK_NoteEdgeOverrides_Notes_SourceNoteId",
                        column: x => x.SourceNoteId,
                        principalTable: "Notes",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_NoteEdgeOverrides_Notes_TargetNoteId",
                        column: x => x.TargetNoteId,
                        principalTable: "Notes",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_NoteEdgeOverrides_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_NoteEdgeOverrides_ProjectId",
                table: "NoteEdgeOverrides",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_NoteEdgeOverrides_TargetNoteId",
                table: "NoteEdgeOverrides",
                column: "TargetNoteId");
        }
    }
}
