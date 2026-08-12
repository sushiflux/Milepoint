namespace Milepoint.Api.Services;

// Generates the 5-char suffix used in project keys: 3 lowercase letters + 2 digits, shuffled
// together, e.g. "a4b9c". Combined with a category code as "{CODE}#{suffix}", e.g. "WEB#a4b9c".
public static class ProjectKeySuffixGenerator
{
    private const string Letters = "abcdefghijklmnopqrstuvwxyz";
    private const string Digits = "0123456789";

    public static string Generate()
    {
        var random = Random.Shared;
        var chars = new char[5];

        for (var i = 0; i < 3; i++)
        {
            chars[i] = Letters[random.Next(Letters.Length)];
        }

        for (var i = 3; i < 5; i++)
        {
            chars[i] = Digits[random.Next(Digits.Length)];
        }

        for (var i = chars.Length - 1; i > 0; i--)
        {
            var j = random.Next(i + 1);
            (chars[i], chars[j]) = (chars[j], chars[i]);
        }

        return new string(chars);
    }
}
