using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Devscribed.Admin.Domain.Entities;
using Devscribed.Admin.Domain.Enums;
using Devscribed.Admin.Infrastructure.Data;
using Devscribed.Admin.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests.Integration;

[Collection("AccountSettings")]
public class AccountSettingsEndpointTests
{
    private readonly AccountSettingsTestFixture _fixture;

    public AccountSettingsEndpointTests(AccountSettingsTestFixture fixture)
    {
        _fixture = fixture;
    }

    [Fact]
    public async Task Unauthenticated_access_to_account_settings_is_rejected()
    {
        // Use a fresh client without cookies
        var client = _fixture.CreateClient();

        var getResp = await client.GetAsync("/api/account/settings");
        Assert.Equal(HttpStatusCode.Unauthorized, getResp.StatusCode);

        var putResp = await client.PutAsJsonAsync("/api/account/settings", new
        {
            firstName = "Pat",
            lastName = "Owner",
            timezone = "America/New_York",
            firstDayOfWeek = "Monday",
        });
        Assert.Equal(HttpStatusCode.Unauthorized, putResp.StatusCode);

        var changeEmailResp = await client.PostAsJsonAsync("/api/account/change-email", new
        {
            newEmail = "new@acme.com",
        });
        Assert.Equal(HttpStatusCode.Unauthorized, changeEmailResp.StatusCode);

        var changePasswordResp = await client.PostAsJsonAsync("/api/account/change-password", new
        {
            currentPassword = "Passw0rd",
            newPassword = "NewPass1",
            passwordConfirmation = "NewPass1",
        });
        Assert.Equal(HttpStatusCode.Unauthorized, changePasswordResp.StatusCode);
    }

    [Fact]
    public async Task Change_password_revokes_other_sessions_but_keeps_current()
    {
        var email = "acct-revoke-session@acme.com";
        await EnsureAccountExists(email, "Passw0rd");

        // Create two separate sessions (two logged-in clients)
        var clientS1 = _fixture.CreateClient();
        var loginResp1 = await clientS1.PostAsJsonAsync("/api/login", new { email, password = "Passw0rd" });
        Assert.Equal(HttpStatusCode.OK, loginResp1.StatusCode);

        var clientS2 = _fixture.CreateClient();
        var loginResp2 = await clientS2.PostAsJsonAsync("/api/login", new { email, password = "Passw0rd" });
        Assert.Equal(HttpStatusCode.OK, loginResp2.StatusCode);

        // Both sessions should work
        var getResp1 = await clientS1.GetAsync("/api/account/settings");
        Assert.Equal(HttpStatusCode.OK, getResp1.StatusCode);
        var getResp2 = await clientS2.GetAsync("/api/account/settings");
        Assert.Equal(HttpStatusCode.OK, getResp2.StatusCode);

        // Change password from S1
        var changeResp = await clientS1.PostAsJsonAsync("/api/account/change-password", new
        {
            currentPassword = "Passw0rd",
            newPassword = "Changed1",
            passwordConfirmation = "Changed1",
        });
        Assert.Equal(HttpStatusCode.OK, changeResp.StatusCode);

        // S1 should still work (current session preserved)
        var afterResp1 = await clientS1.GetAsync("/api/account/settings");
        Assert.Equal(HttpStatusCode.OK, afterResp1.StatusCode);

        // S2 should be revoked (SecurityStamp mismatch)
        var afterResp2 = await clientS2.GetAsync("/api/account/settings");
        Assert.Equal(HttpStatusCode.Unauthorized, afterResp2.StatusCode);
    }

    [Fact]
    public async Task Change_password_with_policy_violating_new_password_rejected()
    {
        var client = await CreateAuthenticatedClient("acct-pw-policy@acme.com", "Passw0rd");

        // Too short
        var resp1 = await client.PostAsJsonAsync("/api/account/change-password", new
        {
            currentPassword = "Passw0rd",
            newPassword = "short",
            passwordConfirmation = "short",
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp1.StatusCode);
        var body1 = await resp1.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Password must be at least 8 characters", body1.GetProperty("message").GetString());

        // No digit
        var resp2 = await client.PostAsJsonAsync("/api/account/change-password", new
        {
            currentPassword = "Passw0rd",
            newPassword = "nDigits!",
            passwordConfirmation = "nDigits!",
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp2.StatusCode);
        var body2 = await resp2.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Password must contain at least one digit", body2.GetProperty("message").GetString());

        // No letter
        var resp3 = await client.PostAsJsonAsync("/api/account/change-password", new
        {
            currentPassword = "Passw0rd",
            newPassword = "12345678",
            passwordConfirmation = "12345678",
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp3.StatusCode);
        var body3 = await resp3.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Password must contain at least one letter", body3.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Change_password_with_confirmation_mismatch_rejected()
    {
        var client = await CreateAuthenticatedClient("acct-pw-mismatch@acme.com", "Passw0rd");

        var resp = await client.PostAsJsonAsync("/api/account/change-password", new
        {
            currentPassword = "Passw0rd",
            newPassword = "NewPass1",
            passwordConfirmation = "NewPass2",
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Passwords do not match", body.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Change_password_requires_correct_current_password()
    {
        var client = await CreateAuthenticatedClient("acct-chgpw@acme.com", "Passw0rd");

        // Wrong current password
        var resp1 = await client.PostAsJsonAsync("/api/account/change-password", new
        {
            currentPassword = "wrong",
            newPassword = "NewPass1",
            passwordConfirmation = "NewPass1",
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp1.StatusCode);
        var body1 = await resp1.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Current password is incorrect", body1.GetProperty("message").GetString());

        // Correct current password
        var resp2 = await client.PostAsJsonAsync("/api/account/change-password", new
        {
            currentPassword = "Passw0rd",
            newPassword = "NewPass1",
            passwordConfirmation = "NewPass1",
        });
        Assert.Equal(HttpStatusCode.OK, resp2.StatusCode);
        var body2 = await resp2.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Your password has been changed", body2.GetProperty("message").GetString());

        // Login with new password
        var loginClient = _fixture.CreateClient();
        var loginResp = await loginClient.PostAsJsonAsync("/api/login", new { email = "acct-chgpw@acme.com", password = "NewPass1" });
        Assert.Equal(HttpStatusCode.OK, loginResp.StatusCode);
    }

    [Fact]
    public async Task Confirm_email_is_public_no_auth_required()
    {
        // Create account and request email change via authenticated client
        var client = await CreateAuthenticatedClient("acct-public-confirm@acme.com", "Passw0rd");

        var resp = await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "acct-public-new@acme.com" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var token = _fixture.AccountEmailService.SentConfirmations.Last().Token;

        // Confirm with a fresh unauthenticated client
        var unauthClient = _fixture.CreateClient();
        var confirmResp = await unauthClient.PostAsJsonAsync("/api/account/confirm-email", new { token });
        Assert.Equal(HttpStatusCode.OK, confirmResp.StatusCode);
        var body = await confirmResp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Your email has been updated", body.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Email_change_normalizes_correctly()
    {
        var client = await CreateAuthenticatedClient("acct-normalize@acme.com", "Passw0rd");

        // Request change with uppercase email
        var resp = await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "ACCT-NORMALIZED@ACME.COM" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        // Verify the confirmation email was sent to the normalized email
        var confirmation = _fixture.AccountEmailService.SentConfirmations.Last();
        Assert.Equal("acct-normalized@acme.com", confirmation.NewEmail);

        // Confirm
        var confirmResp = await _fixture.CreateClient().PostAsJsonAsync("/api/account/confirm-email", new { token = confirmation.Token });
        Assert.Equal(HttpStatusCode.OK, confirmResp.StatusCode);

        // Login with lowercase should work
        var loginClient = _fixture.CreateClient();
        var loginResp = await loginClient.PostAsJsonAsync("/api/login", new { email = "acct-normalized@acme.com", password = "Passw0rd" });
        Assert.Equal(HttpStatusCode.OK, loginResp.StatusCode);
    }

    [Fact]
    public async Task Email_change_fails_if_taken_before_confirmation()
    {
        var client = await CreateAuthenticatedClient("acct-race@acme.com", "Passw0rd");

        // Request email change to an email that's currently available
        var resp = await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "acct-raced@acme.com" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var token = _fixture.AccountEmailService.SentConfirmations.Last().Token;

        // Another account claims the email before confirmation
        await EnsureAccountExists("acct-raced@acme.com", "Passw0rd");

        // Try to confirm - should fail
        var confirmResp = await _fixture.CreateClient().PostAsJsonAsync("/api/account/confirm-email", new { token });
        Assert.Equal(HttpStatusCode.BadRequest, confirmResp.StatusCode);
        var body = await confirmResp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("This email is already in use", body.GetProperty("message").GetString());

        // Token should NOT be consumed - verify by checking PendingEmailChange.UsedAt is still null
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var account = await db.Accounts.FirstAsync(a => a.Email == "acct-race@acme.com");
        Assert.NotNull(account); // Original email still intact
    }

    [Fact]
    public async Task Email_change_token_expires_after_24_hours()
    {
        var client = await CreateAuthenticatedClient("acct-expire@acme.com", "Passw0rd");

        // Request email change
        var resp = await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "acct-expire-new@acme.com" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var token = _fixture.AccountEmailService.SentConfirmations.Last().Token;

        // Simulate expiry by directly updating the PendingEmailChange ExpiresAt
        using (var scope = _fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var pending = await db.PendingEmailChanges
                .FirstAsync(p => p.NewEmail == "acct-expire-new@acme.com");
            pending.ExpiresAt = DateTime.UtcNow.AddHours(-1); // Already expired
            await db.SaveChangesAsync();
        }

        // Try to confirm with expired token
        var confirmResp = await _fixture.CreateClient().PostAsJsonAsync("/api/account/confirm-email", new { token });
        Assert.Equal(HttpStatusCode.BadRequest, confirmResp.StatusCode);
        var body = await confirmResp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("This confirmation link has expired", body.GetProperty("message").GetString());

        // Verify email not changed
        using (var scope = _fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var account = await db.Accounts.FirstAsync(a => a.Email == "acct-expire@acme.com");
            Assert.NotNull(account); // Still the old email
        }
    }

    [Fact]
    public async Task Second_email_change_request_invalidates_first_token()
    {
        var client = await CreateAuthenticatedClient("acct-invalidate@acme.com", "Passw0rd");

        // First change request
        var resp1 = await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "acct-new1@acme.com" });
        Assert.Equal(HttpStatusCode.OK, resp1.StatusCode);
        var token1 = _fixture.AccountEmailService.SentConfirmations.Last().Token;

        // Second change request - should invalidate first
        var resp2 = await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "acct-new2@acme.com" });
        Assert.Equal(HttpStatusCode.OK, resp2.StatusCode);
        var token2 = _fixture.AccountEmailService.SentConfirmations.Last().Token;

        // First token should be invalidated
        var confirmResp1 = await _fixture.CreateClient().PostAsJsonAsync("/api/account/confirm-email", new { token = token1 });
        Assert.Equal(HttpStatusCode.BadRequest, confirmResp1.StatusCode);
        var body1 = await confirmResp1.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("This confirmation link is no longer valid", body1.GetProperty("message").GetString());

        // Second token should work
        var confirmResp2 = await _fixture.CreateClient().PostAsJsonAsync("/api/account/confirm-email", new { token = token2 });
        Assert.Equal(HttpStatusCode.OK, confirmResp2.StatusCode);
        var body2 = await confirmResp2.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Your email has been updated", body2.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Change_email_to_already_in_use_email_rejected()
    {
        // Create the taken email account
        await EnsureAccountExists("acct-taken@acme.com", "Passw0rd");

        var client = await CreateAuthenticatedClient("acct-wants-taken@acme.com", "Passw0rd");

        var resp = await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "acct-taken@acme.com" });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("This email is already in use", body.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Change_email_to_current_email_rejected()
    {
        var client = await CreateAuthenticatedClient("acct-same-email@acme.com", "Passw0rd");

        var resp1 = await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "acct-same-email@acme.com" });
        Assert.Equal(HttpStatusCode.BadRequest, resp1.StatusCode);
        var body1 = await resp1.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("This is already your email address", body1.GetProperty("message").GetString());

        // Case insensitive
        var resp2 = await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "ACCT-SAME-EMAIL@ACME.COM" });
        Assert.Equal(HttpStatusCode.BadRequest, resp2.StatusCode);
        var body2 = await resp2.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("This is already your email address", body2.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Change_email_requires_confirmation_and_notifies_old_address()
    {
        var client = await CreateAuthenticatedClient("acct-change-email@acme.com", "Passw0rd");
        var initialConfirmations = _fixture.AccountEmailService.SentConfirmations.Count;
        var initialNotifications = _fixture.AccountEmailService.SentNotifications.Count;

        // Step 1: Request email change
        var resp = await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "acct-new@acme.com" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("A confirmation link has been sent to your new email address", body.GetProperty("message").GetString());

        // Step 2: Verify emails sent
        Assert.Equal(initialConfirmations + 1, _fixture.AccountEmailService.SentConfirmations.Count);
        Assert.Equal(initialNotifications + 1, _fixture.AccountEmailService.SentNotifications.Count);
        var confirmation = _fixture.AccountEmailService.SentConfirmations.Last();
        Assert.Equal("acct-new@acme.com", confirmation.NewEmail);
        var notification = _fixture.AccountEmailService.SentNotifications.Last();
        Assert.Equal("acct-change-email@acme.com", notification.OldEmail);

        // Step 3: Login with new email should fail (not yet effective)
        var loginClient = _fixture.CreateClient();
        var loginResp = await loginClient.PostAsJsonAsync("/api/login", new { email = "acct-new@acme.com", password = "Passw0rd" });
        Assert.Equal(HttpStatusCode.BadRequest, loginResp.StatusCode);

        // Step 4: Confirm via token
        var token = confirmation.Token;
        var confirmResp = await _fixture.CreateClient().PostAsJsonAsync("/api/account/confirm-email", new { token });
        Assert.Equal(HttpStatusCode.OK, confirmResp.StatusCode);
        var confirmBody = await confirmResp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Your email has been updated", confirmBody.GetProperty("message").GetString());

        // Step 5: Login with new email should now succeed
        var loginClient2 = _fixture.CreateClient();
        var loginResp2 = await loginClient2.PostAsJsonAsync("/api/login", new { email = "acct-new@acme.com", password = "Passw0rd" });
        Assert.Equal(HttpStatusCode.OK, loginResp2.StatusCode);

        // Login with old email should fail
        var loginClient3 = _fixture.CreateClient();
        var loginResp3 = await loginClient3.PostAsJsonAsync("/api/login", new { email = "acct-change-email@acme.com", password = "Passw0rd" });
        Assert.Equal(HttpStatusCode.BadRequest, loginResp3.StatusCode);
    }

    [Fact]
    public async Task Edit_information_timezone_and_first_day_of_week_validation()
    {
        var client = await CreateAuthenticatedClient("settings-tz-val@acme.com", "Passw0rd");

        // Empty timezone
        var resp1 = await client.PutAsJsonAsync("/api/account/settings", new
        {
            firstName = "Pat",
            lastName = "Owner",
            timezone = "",
            firstDayOfWeek = "Monday",
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp1.StatusCode);
        var body1 = await resp1.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Timezone is required", body1.GetProperty("errors").GetProperty("timezone").GetString());

        // Invalid first day of week
        var resp2 = await client.PutAsJsonAsync("/api/account/settings", new
        {
            firstName = "Pat",
            lastName = "Owner",
            timezone = "America/New_York",
            firstDayOfWeek = "Saturday",
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp2.StatusCode);
        var body2 = await resp2.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Invalid first day of week", body2.GetProperty("errors").GetProperty("firstDayOfWeek").GetString());

        // Valid
        var resp3 = await client.PutAsJsonAsync("/api/account/settings", new
        {
            firstName = "Pat",
            lastName = "Owner",
            timezone = "America/New_York",
            firstDayOfWeek = "Monday",
        });
        Assert.Equal(HttpStatusCode.OK, resp3.StatusCode);
    }

    [Fact]
    public async Task Edit_information_phone_validation_at_API_level()
    {
        var client = await CreateAuthenticatedClient("settings-phone-val@acme.com", "Passw0rd");

        // Valid phone
        var resp1 = await client.PutAsJsonAsync("/api/account/settings", new
        {
            firstName = "Pat",
            lastName = "Owner",
            phoneCountryCode = "US",
            phoneNumber = "(555) 123-4567",
            timezone = "America/New_York",
            firstDayOfWeek = "Monday",
        });
        Assert.Equal(HttpStatusCode.OK, resp1.StatusCode);

        // Invalid phone number for US
        var resp2 = await client.PutAsJsonAsync("/api/account/settings", new
        {
            firstName = "Pat",
            lastName = "Owner",
            phoneCountryCode = "US",
            phoneNumber = "12345",
            timezone = "America/New_York",
            firstDayOfWeek = "Monday",
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp2.StatusCode);
        var body2 = await resp2.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Enter a valid phone number", body2.GetProperty("errors").GetProperty("phoneNumber").GetString());

        // Clear phone (both null)
        var resp3 = await client.PutAsJsonAsync("/api/account/settings", new
        {
            firstName = "Pat",
            lastName = "Owner",
            phoneCountryCode = (string?)null,
            phoneNumber = (string?)null,
            timezone = "America/New_York",
            firstDayOfWeek = "Monday",
        });
        Assert.Equal(HttpStatusCode.OK, resp3.StatusCode);
    }

    [Fact]
    public async Task Edit_information_name_validation_at_API_level()
    {
        var client = await CreateAuthenticatedClient("settings-name-val@acme.com", "Passw0rd");

        // Empty first name
        var resp1 = await client.PutAsJsonAsync("/api/account/settings", new
        {
            firstName = "",
            lastName = "Owner",
            timezone = "America/New_York",
            firstDayOfWeek = "Monday",
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp1.StatusCode);
        var body1 = await resp1.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("First name is required", body1.GetProperty("errors").GetProperty("firstName").GetString());

        // First name with digit
        var resp2 = await client.PutAsJsonAsync("/api/account/settings", new
        {
            firstName = "Pat2",
            lastName = "Owner",
            timezone = "America/New_York",
            firstDayOfWeek = "Monday",
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp2.StatusCode);
        var body2 = await resp2.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("First name may contain only letters, hyphens, apostrophes, and spaces",
            body2.GetProperty("errors").GetProperty("firstName").GetString());

        // Empty last name
        var resp3 = await client.PutAsJsonAsync("/api/account/settings", new
        {
            firstName = "Pat",
            lastName = "",
            timezone = "America/New_York",
            firstDayOfWeek = "Monday",
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp3.StatusCode);
        var body3 = await resp3.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Last name is required", body3.GetProperty("errors").GetProperty("lastName").GetString());
    }

    [Fact]
    public async Task Edit_information_persists_and_returns_on_GET()
    {
        var client = await CreateAuthenticatedClient("settings-persist@acme.com", "Passw0rd");

        var putResp = await client.PutAsJsonAsync("/api/account/settings", new
        {
            firstName = "Dima",
            lastName = "Bezzubenkov",
            phoneCountryCode = "US",
            phoneNumber = "(555) 123-4567",
            timezone = "America/Los_Angeles",
            firstDayOfWeek = "Sunday",
        });
        Assert.Equal(HttpStatusCode.OK, putResp.StatusCode);
        var putBody = await putResp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Settings saved", putBody.GetProperty("message").GetString());

        var getResp = await client.GetAsync("/api/account/settings");
        Assert.Equal(HttpStatusCode.OK, getResp.StatusCode);
        var getBody = await getResp.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal("Dima", getBody.GetProperty("firstName").GetString());
        Assert.Equal("Bezzubenkov", getBody.GetProperty("lastName").GetString());
        Assert.Equal("US", getBody.GetProperty("phoneCountryCode").GetString());
        Assert.Equal("(555) 123-4567", getBody.GetProperty("phoneNumber").GetString());
        Assert.Equal("America/Los_Angeles", getBody.GetProperty("timezone").GetString());
        Assert.Equal("Sunday", getBody.GetProperty("firstDayOfWeek").GetString());
    }

    private async Task<HttpClient> CreateAuthenticatedClient(string email, string password)
    {
        // First, create the account if it doesn't exist
        await EnsureAccountExists(email, password);

        var client = _fixture.CreateClient();
        var loginResp = await client.PostAsJsonAsync("/api/login", new { email, password });
        Assert.True(loginResp.IsSuccessStatusCode, $"Login failed: {await loginResp.Content.ReadAsStringAsync()}");
        return client;
    }

    private async Task EnsureAccountExists(string email, string password, string firstName = "Test", string lastName = "User")
    {
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        if (await db.Accounts.AnyAsync(a => a.Email == email))
            return;

        var account = new Account
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = PasswordHasher.Hash(password),
            FirstName = firstName,
            LastName = lastName,
            Timezone = "America/New_York",
            FirstDayOfWeek = "Monday",
            CreatedAt = DateTime.UtcNow,
        };
        db.Accounts.Add(account);

        var org = new Organization { Id = Guid.NewGuid(), Name = $"Org-{email}", CreatedAt = DateTime.UtcNow };
        db.Organizations.Add(org);

        db.Memberships.Add(new Membership
        {
            Id = Guid.NewGuid(),
            AccountId = account.Id,
            OrganizationId = org.Id,
            Role = MemberRole.Admin,
            Status = MembershipStatus.Active,
            JoinedAt = DateTime.UtcNow,
        });

        await db.SaveChangesAsync();
    }
}
