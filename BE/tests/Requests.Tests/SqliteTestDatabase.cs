using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Requests.Infrastructure.Persistence;

namespace Requests.Tests;

public sealed class SqliteTestDatabase : IDisposable
{
    private readonly SqliteConnection _connection;

    public RequestsDbContext Context { get; }

    public SqliteTestDatabase()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<RequestsDbContext>()
            .UseSqlite(_connection)
            .Options;

        Context = new RequestsDbContext(options);
        Context.Database.Migrate();
    }

    public void Dispose()
    {
        Context.Dispose();
        _connection.Dispose();
    }
}
