using Devscribed.Admin.Web.Services;

namespace Devscribed.Admin.Tests.Unit;

public class TokenGeneratorTests
{
    private readonly TokenGenerator _generator = new();

    [Fact]
    public void GenerateToken_produces_url_safe_string_with_no_padding()
    {
        var token = _generator.GenerateToken();

        Assert.DoesNotContain('+', token);
        Assert.DoesNotContain('/', token);
        Assert.DoesNotContain('=', token);
        Assert.NotEmpty(token);
    }

    [Fact]
    public void GenerateToken_produces_distinct_values()
    {
        var t1 = _generator.GenerateToken();
        var t2 = _generator.GenerateToken();

        Assert.NotEqual(t1, t2);
    }

    [Fact]
    public void Hash_is_deterministic_and_not_equal_to_raw_token()
    {
        var token = _generator.GenerateToken();

        var h1 = _generator.Hash(token);
        var h2 = _generator.Hash(token);

        Assert.Equal(h1, h2);
        Assert.NotEqual(token, h1);
    }

    [Fact]
    public void Hash_differs_for_different_tokens()
    {
        var t1 = _generator.GenerateToken();
        var t2 = _generator.GenerateToken();

        Assert.NotEqual(_generator.Hash(t1), _generator.Hash(t2));
    }
}
