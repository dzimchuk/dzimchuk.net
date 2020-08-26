---
title: Managing database schema and seeding data with EF Core migrations
date: 2018-03-15 19:16:28
permalink: managing-database-schema-and-seeding-data-with-ef-core-migrations
excerpt: This post is a quick reference on using EF Core migrations to apply incremental changes to the database including schema updates and static data. It covers preparing your data access projects for migrations, using EF Core CLI and some common practices that you may find useful.
uuid: e5d2cfdb-ff72-4ea7-aefc-597bc22b2f13
tags: Entity Framework, Practices
---

This post is a quick reference on using EF Core migrations to apply incremental changes to the database including schema updates and static data.

We're going to cover the following topics:

1. Preparing your data access projects for migrations.
2. Adding migrations to a data project.
3. Applying migrations to the database.
4. Pre-filling the database with static data.
5. Adding and updating SQL scripts based on migrations.

## Preparing your data access projects for migrations

It's bit of a shame but even as of 2.0 version of [EF Core CLI](https://docs.microsoft.com/en-us/ef/core/miscellaneous/cli/dotnet) it's not possible to use .NET Standard class libraries containing your data access layer with migrations. The problem is that CLI requires a 'startup' project to bootstrap the EF context and the startup project needs to be an executable one. Thus, you will need to turn these class libraries into apps:

```
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>netcoreapp2.0</TargetFramework>
    <OutputType>Exe</OutputType>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer" Version="2.0.1" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.Tools" Version="2.0.1" />
  </ItemGroup>

  <ItemGroup>
    <DotNetCliToolReference Include="Microsoft.EntityFrameworkCore.Tools.DotNet" Version="2.0.1" />
  </ItemGroup>

</Project>
```

You could alternately use the `--startup-project` switch to point to your actual app project but most likely this is going to be your web app and at the bare minimum it must reference `Microsoft.EntityFrameworkCore.Design` package which you may not be comfortable referencing due to an obvious issue with separation of concerns.

The next thing to take care of is `DbContext` initialization when running CLI commands. As of EF Core 2.0 you can add an implementation of `IDesignTimeDbContextFactory` interface to the data project that would create the context. The factory will need a connection string to initialize the context. The problem is that you can't pass parameters from the command line! There is an [open issue](https://github.com/aspnet/EntityFrameworkCore/issues/8332) on GitHub so hopefully it's going to be addressed in one of the upcoming releases. But for now environment variables are our only friends:

```
internal class DesignTimeTestContextFactory : IDesignTimeDbContextFactory<TestContext>
{
    public TestContext CreateDbContext(string[] args)
    {
        var targetEnv = Environment.GetEnvironmentVariable("TargetEnv");
        if (string.IsNullOrWhiteSpace(targetEnv))
        {
            throw new ArgumentException("No target environment has been specified. Please make sure to define TargetEnv environment variable.");
        }
        
        var optionsBuilder = new DbContextOptionsBuilder<TestContext>()
            .UseSqlServer(ConfigurationHelper.GetConnectionString(targetEnv));

        return new TestContext(optionsBuilder.Options);
    }
}
```

The sample code above assume per-environment configuration. The implementation of `ConfigurationHelper` is up to your depending on how and where you store configurations. Here's a sample helper class that gets the connection string from a Service Fabric environment specific XML configuration file:

```
internal static class ConfigurationHelper
    {
        public static string GetConnectionString(string targetEnv)
        {
            var configPath = $"../BookFast/ApplicationParameters/{targetEnv}.xml";
            if (!File.Exists(configPath))
            {
                throw new ArgumentException($"No configuraton exists for target environment '{targetEnv}'. Expected path: {configPath}");
            }

            var doc = XDocument.Parse(File.ReadAllText(configPath));
            var connectionString = (from param in doc.Descendants(XName.Get("Parameter", "http://schemas.microsoft.com/2011/01/fabric"))
                                    let name = param.Attribute("Name")
                                    where name.Value == "Data:DefaultConnection:ConnectionString"
                                    select param.Attribute("Value").Value).FirstOrDefault();

            if (string.IsNullOrWhiteSpace(connectionString))
            {
                throw new Exception($"No connection string found for target environment '{targetEnv}'.");
            }

            return connectionString;
        }
    }
```

Before running any EF Core CLI commands make sure to define the `TargetEnv` variable for the current process:

```
set TargetEnv=Dev
```

## Adding migrations to a data project

Once you've modified your data model you need to add a new migration to reflect the changes. Open up a console prompt and `cd` to your data project.

It's important to use well-thought naming conventions for migrations. This will let you easily identify the sequence of migrations in source code and in `__EFMigrationsHistory` table. This can be useful when you need to reference specific migrations from CLI as shown in the examples below or check what migrations have been already applied to the database. One possible convention might be:

```
<Service name>_<Index>, e.g. FacilityService_001
```

To add a migration execute the following command:

```
dotnet ef migrations add FacilityService_00X
```

## Applying migrations to the database

The following command applies all new migrations that have been added since the last applied one:

```
dotnet ef database update
```

You can also specify up to what migrations you want to apply changes.

## Pre-filling the database with static data

Seeding the database with static data is a common need. In EF Core 2.1 it will be possible to populate the database with initial data using the [new API](https://docs.microsoft.com/en-us/ef/core/modeling/data-seeding). In EF Core 2.0 you can do that by adding new empty migrations and using the following APIs to add, update or delete data:

```
MigrationBuilder.InsertData
MigrationBuilder.UpdateData
MigrationBuilder.DeleteData
MigrationBuilder.Sql
```

Please note that as of 2.0 there is still an [issue](https://github.com/aspnet/EntityFrameworkCore/issues/10115) in `UpdateData` that ignores the specified schema parameter. You will have to work around it by first dropping the old records and reinserting updated ones. Things will get quickly complicated when you also need to drop and recreate constraints. So a better option will be using `MigrationBuilder.Sql` to execute raw SQL. Besides, this will often be the only option when you need to transform existing data.

## Adding and updating SQL scripts based on migrations

You can probably do well with just using the tooling but if for some reason you need SQL version of your migrations here's how you do it.

For the very first migration (001) you specify 0 as the starting point:

```
dotnet ef migrations script 0 FacilityService_001 -i -o ../Database/FacilityService_001.sql
```

For subsequent migrations you specify the existing migration as a starting point (e.g. `FacilityService_001`) and the newly added migration as a target point (e.g. `FacilityService_002`):

```
dotnet ef migrations script FacilityService_001 FacilityService_002 -i -o ../Database/FacilityService_002.sql
```

You can also generate a script that will include all migrations for your data project:

```
dotnet ef migrations script -i -o ../Database/FacilityService.sql
```

Make sure to generate idempotent scripts using the `-i` switch.