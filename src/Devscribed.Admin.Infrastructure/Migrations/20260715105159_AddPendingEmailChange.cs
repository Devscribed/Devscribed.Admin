using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Devscribed.Admin.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPendingEmailChange : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PendingEmailChanges",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    AccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    NewEmail = table.Column<string>(type: "TEXT", maxLength: 254, nullable: false),
                    TokenHash = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UsedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    IsInvalidated = table.Column<bool>(type: "INTEGER", nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PendingEmailChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PendingEmailChanges_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PendingEmailChanges_AccountId_IsInvalidated",
                table: "PendingEmailChanges",
                columns: new[] { "AccountId", "IsInvalidated" });

            migrationBuilder.CreateIndex(
                name: "IX_PendingEmailChanges_TokenHash",
                table: "PendingEmailChanges",
                column: "TokenHash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PendingEmailChanges");
        }
    }
}
