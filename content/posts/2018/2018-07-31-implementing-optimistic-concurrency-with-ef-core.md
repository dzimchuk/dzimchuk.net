---
title: Implementing optimistic concurrency with EF Core
date: 2018-07-31T17:05:00.000Z
lastmod: 2018-07-31T17:05:00.000Z
permalink: implementing-optimistic-concurrency-with-ef-core
excerpt: Entity Framework Core provides built-in support for optimistic concurrency control but it only works during the lifetime of the context when in most realistic scenarios it needs to work across a longer period that involves a roundtrip to the client app and back the server.
uuid: ff210394-5201-44a3-ba45-5255079e0f1d
tags: Entity Framework, ASP.NET, Design and Architecture
---

Entity Framework Core provides built-in [support](https://docs.microsoft.com/en-us/ef/core/saving/concurrency) for optimistic concurrency control when multiple processes or users make changes independently without the overhead of synchronization or locking. If the changes do not interfere no further action is required. If there was a conflict then only one process should succeed and others need to refresh their state.

The problem is that the mechanism works during the lifetime of the context while in most realistic scenarios it needs to work across a longer period that involves a roundtrip to the client app and back the server.

Normally it's achieved with the `ETag` header that is sent to the client with a resource representation and is expected back from the client in the update request.

To propagate the `ETag` value across application layers we can use a scoped instance of the special `ChangeContext`:

```
public class ChangeContext
{
    public int EntityId { get; set; }
    public byte[] Timestamp { get; set; }
}
```

It's registered as a scoped instance with the DI container so that all components involved in processing the request gets the same instance of the context.

```
services.AddScoped<ChangeContext>();
```

The `Timestamp` is the concurrency token that should be configured in data entities. While it's possible to use arbitrary fields as concurrency tokens often it's easier to use a row version field managed by the database. Official [documentation](https://docs.microsoft.com/en-us/ef/core/modeling/concurrency) provides details on configuring the concurrency token.

Actions or controllers that require optimistic concurrency control can then be decorated with a custom action filter that is responsible for retrieving the header value before handling the request and sending it back with a response.

```
public class UseOptimisticConcurrencyAttribute : TypeFilterAttribute
{
    public UseOptimisticConcurrencyAttribute() : base(typeof(UseOptimisticConcurrencyFilter))
    {
    }

    private class UseOptimisticConcurrencyFilter : IActionFilter
    {
        private readonly ChangeContext changeContext;

        public UseOptimisticConcurrencyFilter(ChangeContext changeContext)
        {
            this.changeContext = changeContext;
        }

        public void OnActionExecuting(ActionExecutingContext context)
        {
            if (context.HttpContext.Request.Headers.ContainsKey("ETag"))
            {
                changeContext.Timestamp = Convert.FromBase64String(context.HttpContext.Request.Headers["ETag"]);
            }
        }

        public void OnActionExecuted(ActionExecutedContext context)
        {
            if (changeContext.Timestamp != null)
            {
                context.HttpContext.Response.Headers.Add("ETag", Convert.ToBase64String(changeContext.Timestamp));
            }

            if (context.Exception is ConcurrencyException concurrencyException)
            {
                context.Result = new ConflictObjectResult(concurrencyException);
                context.ExceptionHandled = true;
            }
        }
    }
}
```

In your read stack at the data layer all you need to do is set the `Timestamp` property on the `ChangeContext` to the value read from the data entity. You shouldn't propagate the value as part of your DTO or a representation object. Just inject the `ChangeContext` into your data source.

In your command (update) stack things get a little more involved but there is nothing extraordinary either. Normally, the update flow is the following: you rehydrate the domain model (or just application level model) from the storage, run some logic on it and send the updated model back to the repository to persist it.

The repository normally gets injected an instance of `DbContext` and that same context is used to both read and track the data entity that maps to your application model as well as to write back changes derived from the updated application model.

Warning! If you don't follow this flow and instantiate a new instance of `DbContext` upon each call to the repository then the approach I'm describing here won't work. In this case you should also ask yourself why you're doing it this way and throwing away change tracking capability of EF.

Alright, where were we? You may either come up with a decorator for your repository to add concurrency handling logic:

```
internal class ConcurrencyHandlingRepository : IMyEntityRepository
{
    private readonly IMyEntityRepository repository;
    private readonly MyDbContext dbContext;
    private readonly ChangeContext changeContext;

    private const string Timestamp = "Timestamp";

    public ConcurrencyHandlingRepository(IMyEntityRepository repository, 
        MyDbContext dbContext, 
        ChangeContext changeContext)
    {
        this.repository = repository;
        this.dbContext = dbContext;
        this.changeContext = changeContext;
    }

    public async Task<int> AddAsync(MyEntity domainModel)
    {
        var id = await repository.AddAsync(domainModel);

        changeContext.EntityId = id;

        return id;
    }

    public async Task<MyEntity> FindAsync(int id)
    {
        var domainModel = await repository.FindAsync(id);

        if (domainModel != null && changeContext.Timestamp != null)
        {
            var trackedEntity = await dbContext.MyEntities.FindAsync(domainModel.Id);
            dbContext.Entry(trackedEntity).OriginalValues[Timestamp] = changeContext.Timestamp;
        }

        changeContext.EntityId = id;

        return domainModel;
    }

    public async Task SaveChangesAsync()
    {
        try
        {
            await repository.SaveChangesAsync();

            // return the updated timestamp to the client
            var trackedEntity = await dbContext.MyEntities.FindAsync(changeContext.EntityId);
            var dbValues = await dbContext.Entry(trackedEntity).GetDatabaseValuesAsync();
            if (dbValues != null)
            {
                changeContext.Timestamp = dbValues[Timestamp] as byte[];
            }
        }
        catch (DbUpdateConcurrencyException ex)
        {
            throw new ConcurrencyException(ex);
        }
    }
}
```

The approach with the decorator works because by default `DbContext` is registered as a scoped instance with the DI container so your repository and the decorator will the get the same instance.

There are 3 sets of values tracked by EF Core for your entities:
* **Current** values are the values that the application was attempting to write to the database.
* **Original** values are the values that were originally retrieved from the database, before any edits were made.
* **Database** values are the values currently stored in the database.

It's the original value of the concurrency token that gets compared in SQL updates. Thus the trick to override the value with the one received with `ETag` in `FindAsync` method.

Both `FindAsync` and `AddAsync` methods also capture the ID of the entity to facilitate logic in `SaveChangeAsync` method.

`SaveChangesAsync` does 2 things:
1. Tries to persist changes to the database catching the possible concurrency conflict error and transforming the error to the custom `ConcurrencyException` that can be used at the application layer.
2. Updating the `Timestamp` value in `ChangeContext` with the new value which we want to return as `ETag` to the caller in response to the update operation.

## Potential issues to be aware of

In real life applications things often get more complicated. Imagine that some properties of your entity get updated by a background task. Perhaps, it's a remote reference number that you await from an external system or a status field that gets calculated based on a set of conditions that happen in parallel with the user working with the entity.

You certainly don't want the user to be faced with the conflict error message when some properties get updated that he has no influence on and that may not even be visible to her on the UI. You want to think about how you map your business entities to data entities and store things that need to undergo concurrency checks separately from things that shouldn't. Yes, it may not always be the case either, but something to be mindful about.

Another unexpected effect you may run into is when you have chained updated. Suppose your domain model raises an event as a result of an update operation and that event is handled within the same operation scope. As you may have guessed, the second update will overwrite the `Timestamp` original value of the second entity as all repositories share the same instance of `ChangeContext`! As a result, the whole operation will fail.

One way of dealing with the second issue is to introduce a one-time timestamp, that is, only the first operation is allowed to use it.

```
public class ChangeContext
{
    public int EntityId { get; set; }
    public byte[] Timestamp { get; set; }

    private bool timestampTakenOnce = false;

    public byte[] GetTimestampOnce()
    {
        if (!timestampTakenOnce)
        {
            timestampTakenOnce = true;
            return Timestamp;
        }

        return null;
    }
}
```

The repository should use the `GetTimestampOnce()` instead of the property getter to drive its logic in `FindAsync` method.