using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Milepoint.Api.Data.Migrations.SqlServer
{
    /// <inheritdoc />
    public partial class AddNoteFreeViewPosition : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "FreeViewX",
                table: "Notes",
                type: "float",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "FreeViewY",
                table: "Notes",
                type: "float",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FreeViewX",
                table: "Notes");

            migrationBuilder.DropColumn(
                name: "FreeViewY",
                table: "Notes");
        }
    }
}
