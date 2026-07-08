using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Devscribed.Admin.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddJobTitleAndTimezone : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "JobTitle",
                table: "Memberships",
                type: "TEXT",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Timezone",
                table: "Accounts",
                type: "TEXT",
                maxLength: 100,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "JobTitle",
                table: "Memberships");

            migrationBuilder.DropColumn(
                name: "Timezone",
                table: "Accounts");
        }
    }
}
