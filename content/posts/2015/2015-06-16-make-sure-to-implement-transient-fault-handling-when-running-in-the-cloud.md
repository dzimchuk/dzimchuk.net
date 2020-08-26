---
title: Make sure to implement transient fault handling when running in the cloud
date: 2015-06-16 18:17:13
permalink: make-sure-to-implement-transient-fault-handling-when-running-in-the-cloud
excerpt: Applications running in the cloud or just making use of various external services are likely to face temporary failures when trying to communicate with these services. These failures could be network connectivity issues or request timeouts when external services are overloaded.
uuid: 9be243d4-faca-4b69-acb2-9f1a87fd7186
tags: Cloud Patterns
---

Applications running in the cloud or just making use of various external services are likely to face temporary failures when trying to communicate with these services. These failures could be network connectivity issues or request timeouts when external services are overloaded. An important aspect of these failures is that they are self-healing and if we retry calling services after a suitable delay these calls are likely to succeed.

It is necessary to be able to distinguish transient errors from fatal ones. If we know that a particular kind of error response indicates a temporary problem we may choose to repeat our attempt to call the service. We should also define how this repetition is going to be done (equal intervals, linearly increasing intervals or perhaps exponentially increasing intervals), maximum number of reties or maybe even implement a more sophisticated [Circuit Breaker](https://msdn.microsoft.com/en-us/library/dn589784.aspx) logic that wouldn't make attempts to retry if it decides that those are likely to fail anyway.

## Transient Fault Handling Application Block

Transient Fault Handling Application Block (aka [Topaz](http://topaz.codeplex.com/)) helps you implement the [Retry pattern](https://msdn.microsoft.com/en-us/library/dn589788.aspx) when working with variety of services. It supports:

*   SQL Databases
*   Azure Service Bus
*   Azure Storage Service
*   Azure Caching Service

The block is available as a set of NuGet packages which allows you to pick ones that you need:

```
EnterpriseLibrary.TransientFaultHandling
EnterpriseLibrary.TransientFaultHandling.Data 
EnterpriseLibrary.TransientFaultHandling.WindowsAzure.Storage
EnterpriseLibrary.TransientFaultHandling.ServiceBus
EnterpriseLibrary.TransientFaultHandling.Caching 
EnterpriseLibrary.TransientFaultHandling.Configuration

```

When working with the Application Block you need to define a retry policy which basically consists of two things:

1.  Retry strategy.  
    Determines delays between retries (fixed intervals, linear increasing intervals or random exponential back-off intervals).
2.  Detection strategy.  
    The logic that determines if an error has a transient nature when it makes sense to perform subsequent attempts to call the service.

Each specific package targeting a particular service implements that service specific detection strategy. You can define the retry policy both imperatively in code or declaratively in the configuration file.

Note that although the Block covers some widely used services it of course cannot cover every other service out there. However, it allows you to implement a custom detection strategy to handle response of a particular service and I’ll show you an example of such a strategy later in this post.

It should also be mentioned that some services supported by the Block implement provide their client libraries that implement the Retry pattern on their own. Let’s go over the commonly used services and see how to implement transient fault handling when communicating with them.

## Azure Storage and Service Bus

If you use official client libraries to work with these services you don’t need to do anything. They have Retry logic built-in and it’s recommended over the one from Transient Fault Handling Application Block. However, if you are using Service Bus for Windows Server you can still use the Azure Server Bus detection strategy from the Application Block to detect any transient faults when communicating with the service bus just as you would use it when working with Azure Service Bus.

For more information on the Retry policy in the storage libraries and how you can customize it see this [blog post](http://blogs.msdn.com/b/windowsazurestorage/archive/2011/02/03/overview-of-retry-policies-in-the-windows-azure-storage-client-library.aspx). Here’s another great [post](http://blogs.msdn.com/b/agile/archive/2013/05/22/dealing-with-windows-azure-storage-transient-faults.aspx) describing storage library built-in support for retry vs Topaz.

## Azure Cache

The Application Block works with both [In-Role cache](https://msdn.microsoft.com/en-us/library/azure/dn386103.aspx) as well as [Azure Cache service](https://msdn.microsoft.com/en-us/library/azure/dn386094.aspx). The key is to use `CacheTransientErrorDetectionStrategy`. This is how you would use the Block if imagine you implement a caching façade like this:

```
public class Cache<TKeyType, TValueType>
{
   private readonly RetryPolicy<CacheTransientErrorDetectionStrategy> retryPolicy = 
        new RetryPolicy<CacheTransientErrorDetectionStrategy>(RetryStrategy.DefaultClientRetryCount);

   private readonly DataCache cache;

   public Cache(string cacheName)
   {
      try
      {
          var cacheFactory = new DataCacheFactory();
          cache = cacheFactory.GetCache(cacheName);
      }
      catch (DataCacheException e)
      {
          // log it
      }
   }

    public TValueType GetItem(TKeyType key)
    {
        try
        {
            return cache == null ? default(TValueType) :
                retryPolicy.ExecuteAction(() => cache.Get(key.ToString()) as TValueType);
        }
        catch (DataCacheException e)
        {
            // log it
            return default(TValueType);
        }
    }
}

```

If you’re using or considering to switch to [Redis](https://msdn.microsoft.com/en-us/library/azure/dn690523.aspx) you will need to implement a custom detection strategy (see below).

## SQL databases

If you directly use ADO.NET to access SQL databases (either connected or disconnected models) you can make use of `SqlDatabaseTransientErrorDetectionStrategy` to determine if SQL error number in `SQLException` indicates a transient error and rely on the Application Block to apply the retry strategy that you have chosen.

You can either use a similar approach as with caching and open the connection and run commands and queries inside an action that you pass to `ExecuteAction` or `ExecuteAsync` methods on the `RetryPolicy` objects.

Alternatively the Application Block provides a decorator for `SqlConnection` that can handle retry logic for you:

```
var policy = new RetryPolicy<SqlDatabaseTransientErrorDetectionStrategy>(RetryStrategy.DefaultExponential);

using (var conn = new ReliableSqlConnection("<connection string>", policy))
{
    conn.Open();
    var command = conn.CreateCommand();
    ...
}

```

You can also specify different retry policy that are used for opening connections and executing commands.

## Entity Framework

Starting with version 6 Entity Framework provides its own mechanism to handle and recover from transient errors. The key is to set a `IDbExecutionStrategy` on the `DbConfiguration` and Entity Framework provides an implementation of one called `SqlAzureExecutionStrategy`:

```
internal class Program
{
    static void Main(string[] args)
    {
        DbConfiguration.SetConfiguration(new CustomDatabaseConfiguration());
        ...
    }
}

internal class CustomDatabaseConfiguration : DbConfiguration
{
    public CustomDatabaseConfiguration()
    {
        var maxRetryCount = 3;
        var maxDelay = TimeSpan.FromSeconds(3);
        SetExecutionStrategy("System.Data.SqlClient", () => new SqlAzureExecutionStrategy(maxRetryCount, maxDelay));
    }
}

```

`SqlAzureExecution` strategy will use exponentially increasing delays between retries within the limits that you set on the maximum number of retries and the maximum delay.

## Custom detection strategy

There are a lot more services that you might be using in your solutions that Transient Fault Handling Application Block doesn’t provide a handler for out of the box. In these cases you can implement a custom detection strategy and let the Application Block use it to distinguish transient errors from fatal ones.

In my previous post I showed an example of such a strategy that I used to communicate with Azure Search service:

```
internal class SearchIndexErrorDetectionStrategy : ITransientErrorDetectionStrategy
{
    public bool IsTransient(Exception ex)
    {
        return ex is IndexBatchException;
    }
}

```

Detection strategy is responsible for one thing – determine if an exception represents a transient self-correcting fault or not. It normally examines exception types and exception object internal data to do the job.

You use custom detection strategies the same way you use any of the built-in ones:

```
public static void Execute(IndexAction action)
{
    var retryPolicy = new RetryPolicy<SearchIndexErrorDetectionStrategy>(RetryStrategy.DefaultExponential);
    retryPolicy.ExecuteAction(() => IndexClient.Documents.Index(IndexBatch.Create(action)));
}

```

## Resources

[Transient Fault Handling](https://msdn.microsoft.com/en-us/library/hh675232.aspx)  
[Transient Fault Handling Application Block documentation](https://msdn.microsoft.com/en-us/library/dn440719(v=pandp.60).aspx)  
[Retry pattern](https://msdn.microsoft.com/en-us/library/dn589788.aspx)