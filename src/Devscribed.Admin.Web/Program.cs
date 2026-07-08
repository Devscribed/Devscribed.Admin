using Devscribed.Admin.Application.Auth;
using Devscribed.Admin.Application.Invitations;
using Devscribed.Admin.Application.Members;
using Devscribed.Admin.Application.Security;
using Devscribed.Admin.Application.Signup;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Devscribed.Admin.Web.Auth;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorPages();

builder.Services.AddDbContext<AdminDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Default")
        ?? "Data Source=devscribed-admin.db"));

builder.Services.AddScoped<IPasswordHasher, PasswordHasher>();
builder.Services.AddScoped<SignupService>();
builder.Services.AddScoped<LoginService>();
builder.Services.AddScoped<ForgotPasswordService>();
builder.Services.AddScoped<ResetPasswordService>();
builder.Services.AddScoped<ChangeRoleService>();
builder.Services.AddScoped<ManageMemberStatusService>();
builder.Services.AddScoped<UpdateJobTitleService>();
builder.Services.AddScoped<InviteMemberService>();
builder.Services.AddScoped<AcceptInvitationService>();
builder.Services.AddSingleton<InMemoryInvitationEmailSender>();
builder.Services.AddSingleton<IInvitationEmailSender>(sp => sp.GetRequiredService<InMemoryInvitationEmailSender>());
builder.Services.AddSingleton(TimeProvider.System);

builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/Login";
        options.Cookie.Name = "devscribed.admin.auth";
    });
builder.Services.AddAuthorization();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AdminDbContext>();
    db.Database.Migrate();
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();

app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();

app.MapStaticAssets();
app.MapRazorPages()
   .WithStaticAssets();

app.MapPost("/api/signup", async (SignupApiRequest request, SignupService signupService, HttpContext http) =>
{
    var result = await signupService.SignUpAsync(new SignupRequest(
        request.OrgName,
        request.FirstName,
        request.LastName,
        request.Email,
        request.Password));

    if (!result.Success)
    {
        return Results.Json(new { errors = result.FieldErrors }, statusCode: StatusCodes.Status400BadRequest);
    }

    await OrganizationAuth.SignInAsync(http, result.Account!, result.Organization!, result.Membership!);

    return Results.Json(new
    {
        organizationId = result.Organization!.Id,
        redirectUrl = "/Members"
    });
});

app.MapPost("/api/login", async (LoginApiRequest request, LoginService loginService, HttpContext http) =>
{
    var result = await loginService.LoginAsync(new LoginRequest(request.Email, request.Password));

    if (!result.Success)
    {
        return Results.Json(new { error = result.Error }, statusCode: StatusCodes.Status401Unauthorized);
    }

    await OrganizationAuth.SignInAsync(http, result.Account!, result.Organization!, result.Membership!);

    return Results.Json(new { redirectUrl = "/Members" });
});

app.MapPost("/api/forgot-password", async (ForgotPasswordApiRequest request, ForgotPasswordService forgotService) =>
{
    await forgotService.RequestResetAsync(request.Email);

    return Results.Json(new { message = "if an account exists, a reset link has been sent" });
});

app.MapPost("/api/reset-password", async (ResetPasswordApiRequest request, ResetPasswordService resetService) =>
{
    var result = await resetService.ResetAsync(request.Token, request.Password);

    if (!result.Success)
    {
        return Results.Json(new { error = result.Error }, statusCode: StatusCodes.Status400BadRequest);
    }

    return Results.Json(new { message = "password has been reset" });
});

app.MapPut("/api/members/{id:guid}/role", async (Guid id, ChangeRoleApiRequest request, ChangeRoleService changeRoleService, HttpContext http) =>
{
    var callerAccountId = Guid.Parse(http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
    var organizationId = OrganizationAuth.GetOrganizationId(http.User);

    if (!Enum.TryParse<MembershipRole>(request.Role, true, out var newRole))
        return Results.Json(new { error = "invalid role" }, statusCode: StatusCodes.Status400BadRequest);

    var result = await changeRoleService.ChangeRoleAsync(
        callerAccountId, organizationId, new ChangeRoleRequest(id, newRole));

    if (!result.Success)
    {
        var statusCode = result.Error == "forbidden"
            ? StatusCodes.Status403Forbidden
            : StatusCodes.Status400BadRequest;
        return Results.Json(new { error = result.Error }, statusCode: statusCode);
    }

    return Results.Json(new { success = true });
}).RequireAuthorization();

app.MapPost("/api/members/{id:guid}/remove", async (Guid id, ManageMemberStatusService manageMemberStatusService, HttpContext http) =>
{
    var callerAccountId = Guid.Parse(http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
    var organizationId = OrganizationAuth.GetOrganizationId(http.User);

    var result = await manageMemberStatusService.RemoveAsync(callerAccountId, organizationId, id);

    if (!result.Success)
    {
        var statusCode = result.Error == "forbidden"
            ? StatusCodes.Status403Forbidden
            : StatusCodes.Status400BadRequest;
        return Results.Json(new { error = result.Error }, statusCode: statusCode);
    }

    return Results.Json(new { success = true });
}).RequireAuthorization();

app.MapPost("/api/members/{id:guid}/restore", async (Guid id, ManageMemberStatusService manageMemberStatusService, HttpContext http) =>
{
    var callerAccountId = Guid.Parse(http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
    var organizationId = OrganizationAuth.GetOrganizationId(http.User);

    var result = await manageMemberStatusService.RestoreAsync(callerAccountId, organizationId, id);

    if (!result.Success)
    {
        var statusCode = result.Error == "forbidden"
            ? StatusCodes.Status403Forbidden
            : StatusCodes.Status400BadRequest;
        return Results.Json(new { error = result.Error }, statusCode: statusCode);
    }

    return Results.Json(new { success = true });
}).RequireAuthorization();

app.MapPut("/api/members/{id:guid}/job-title", async (Guid id, UpdateJobTitleApiRequest request, UpdateJobTitleService updateJobTitleService, HttpContext http) =>
{
    var callerAccountId = Guid.Parse(http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
    var organizationId = OrganizationAuth.GetOrganizationId(http.User);

    var result = await updateJobTitleService.UpdateAsync(
        callerAccountId, organizationId, id, request.JobTitle);

    if (!result.Success)
    {
        var statusCode = result.Error == "forbidden"
            ? StatusCodes.Status403Forbidden
            : StatusCodes.Status400BadRequest;
        return Results.Json(new { error = result.Error }, statusCode: statusCode);
    }

    return Results.Json(new { success = true });
}).RequireAuthorization();

app.MapPost("/api/invitations", async (InviteMemberApiRequest request, InviteMemberService inviteService, HttpContext http) =>
{
    var callerAccountId = Guid.Parse(http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
    var organizationId = OrganizationAuth.GetOrganizationId(http.User);

    if (!Enum.TryParse<MembershipRole>(request.Role, true, out var role))
        return Results.Json(new { error = "invalid role" }, statusCode: StatusCodes.Status400BadRequest);

    var result = await inviteService.InviteAsync(
        callerAccountId,
        organizationId,
        new InviteMemberRequest(request.Email, role));

    if (!result.Success)
    {
        var statusCode = result.Error == "forbidden"
            ? StatusCodes.Status403Forbidden
            : StatusCodes.Status400BadRequest;
        return Results.Json(new { error = result.Error }, statusCode: statusCode);
    }

    return Results.Json(new { success = true });
}).RequireAuthorization();

app.MapPost("/api/invitations/accept", async (AcceptInvitationApiRequest request, AcceptInvitationService acceptService, HttpContext http) =>
{
    var result = await acceptService.AcceptAsync(new AcceptInvitationRequest(
        request.Token,
        request.FirstName,
        request.LastName,
        request.Password));

    if (!result.Success)
    {
        return Results.Json(new { error = result.Error }, statusCode: StatusCodes.Status400BadRequest);
    }

    await OrganizationAuth.SignInAsync(http, result.Account!, result.Organization!, result.Membership!);
    return Results.Json(new { redirectUrl = "/Members" });
});

app.MapPost("/api/logout", async (HttpContext http) =>
{
    await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.Json(new { redirectUrl = "/Login" });
});

app.Run();

public record SignupApiRequest(string OrgName, string FirstName, string LastName, string Email, string Password);
public record LoginApiRequest(string Email, string Password);
public record ForgotPasswordApiRequest(string Email);
public record ResetPasswordApiRequest(string Token, string Password);

public record ChangeRoleApiRequest(string Role);
public record UpdateJobTitleApiRequest(string? JobTitle);
public record InviteMemberApiRequest(string Email, string Role);
public record AcceptInvitationApiRequest(string Token, string? FirstName, string? LastName, string? Password);

public partial class Program;
