using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Requests.Domain.Entities;

namespace Requests.Infrastructure.Persistence;

public class RequestsDbContext : DbContext
{
    public RequestsDbContext(DbContextOptions<RequestsDbContext> options) : base(options)
    {
    }

    public DbSet<Request> Requests => Set<Request>();
    public DbSet<User> Users => Set<User>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var utc = new ValueConverter<DateTime, DateTime>(
            v => v,                                          // write: identity — storage and indexes unchanged
            v => DateTime.SpecifyKind(v, DateTimeKind.Utc)); // read: restore the kind SQLite cannot store

        modelBuilder.Entity<Request>(b =>
        {
            b.Property(x => x.CreatedAt).HasConversion(utc);
            b.Property(x => x.UpdatedAt).HasConversion(utc);

            b.HasIndex(x => new { x.OwnerId, x.CreatedAt });          // permission path + default order
            b.HasIndex(x => new { x.AssignedToUserId, x.CreatedAt }); // permission path + default order
            b.HasIndex(x => x.CreatedAt);
            b.HasIndex(x => x.RequestNumber);                         // exact lookups; REQ-F-001 will not use it (ADR-006)

            b.HasOne<User>().WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<User>().WithMany().HasForeignKey(x => x.AssignedToUserId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<User>(b =>
        {
            b.HasIndex(x => x.Username).IsUnique();
        });
    }
}
