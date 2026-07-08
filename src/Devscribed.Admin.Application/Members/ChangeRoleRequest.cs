using Devscribed.Admin.Domain;

namespace Devscribed.Admin.Application.Members;

public record ChangeRoleRequest(Guid MembershipId, MembershipRole NewRole);
