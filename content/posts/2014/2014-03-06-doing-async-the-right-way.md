---
title: Doing async the right way
date: 2014-03-06T09:37:00.000Z
lastmod: 2015-04-22T18:40:46.000Z
permalink: doing-async-the-right-way
uuid: 191bf496-9fa6-487c-8c03-d9ae1396850f
tags: .NET
---

I’ve stumbled upon a couple of methods in the server side code of a project I happened to be involved in that were trying to accomplish their tasks in an asynchronous manner but in a way that made me want to fix them right away when I saw them. Both methods belonged to the data layer of the server app. Let me give you concise views of the methods with irrelevant details stripped out. Names have been changed to protect to guilty and the innocent.

One was trying to call a database through EF data context:

```
public Task<Product> GetProduct(int id)
{
    return Task.Run(() =>
                    {
                        using (var context = new MyDbContext())
                        {
                            return context.Products.Find(id);
                        }
                    });
}

```

The other one was fetching records from Windows Azure Table storage:

```
public Task<IEnumerable<Record>> GetRecords(string partitionKey)
{
    var account = CloudStorageAccount.Parse("<connectionString>");
    var client = account.CreateCloudTableClient();
    var table = client.GetTableReference("TheTable");

    var query = new TableQuery<Record>().
        Where(TableQuery.GenerateFilterCondition("PartitionKey",
            QueryComparisons.Equal, partitionKey));

    return Task.Run(() =>
                    {
                        return table.ExecuteQuery(query);
                    });
}

```

The problem with the methods above is that although they return control to the caller immediately without waiting for the back end storage to respond, technique they employ is absolutely useless on the server.

A server maintains a pool of threads to process requests from the client. You want to make sure your server is as scalable as possible and one aspect of that is to make sure there are enough threads in the pool to process upcoming requests.

Imagine you’ve got 100 worker threads in the pool and a request comes in. One thread is sent to process it and there are still 99 threads available in the pool. That thread does its work and runs `Task.Run` which effectively schedules a routine to be run on another worker thread from the pool. The framework (be it Web API or MVC) recognizes that an asynchronous operation has been initiated and the current thread has nothing else to do so it returns it to the pool. However, another thread has already been dispatched from the pool to process the scheduled task. Ultimately there are still 99 available threads in the pool. We didn’t improve anything and could as well just call those methods synchronously on the original thread.

What we want to achieve is that our worker thread gets returned to the pool and the waiting is done on a special kind of thread called a completion threads. Completion threads are special type of kernel objects maintained by the operating system. They are lightweight and don’t have much of the overhead of regular worker thread. As a result they can’t run code but they can be used to wait on an IO operation to complete.

> Asynchrony on the server is effective for IO-bound operations as it allows you to release the worker thread so its available to process other request while keep waiting on an IO operation to complete. If you’ve got a CPU-bound operation there is no use to offload it to another thread because it will be just another thread from the pool and you will actually experience an overhead of the context switch.

So how would we want to go about fixing the examples shown above to make them wait on completion threads? It would require help of the corresponding frameworks. Entity Framework version 6 and up front supports asynchronous operations and queries through a set of special extension methods. For example, the query for a product by an Id would look something like:

```
public Task<Product> GetProduct(int id)
{
    using (var context = new MyDbContext())
    {
        return context.Products.
            FirstOrDefaultAsync(p => p.ProductId == id);
    }
}

```

What if you’re running an older version and for any reason can’t upgrade? My first advice will be to upgrade because you’re missing out on some great new features. But if you still can’t then just use synchronous calls. Don’t fake them with `Task.Run`. You may want to fake them with `TaskCompletionSource` (or just `Task.FromResult<T>()`) if you plan to upgrade in the future and want to have asynchronous interfaces in place now. However, I wouldn’t recommend that.

As to the client storage library for Windows Azure it does support asynchronous overloads for operations, however there is no overload for the `ExecuteQuery` method. This method is special because it takes care about the continuation token under the hood and makes sure you end up with all the records, not just a partial set of records. There are asynchronous overloads for `ExecuteQuerySegmented` method but you have to take the continuation token into account. So our rewritten procedure will look like:

```
public async Task<IEnumerable<Record>> GetRecords(string partitionKey)
{
    var account = CloudStorageAccount.Parse("<connectionString>");
    var client = account.CreateCloudTableClient();
    var table = client.GetTableReference("TheTable");

    var query = new TableQuery<Record>().
        Where(TableQuery.GenerateFilterCondition("PartitionKey",
            QueryComparisons.Equal, partitionKey));

    return await FetchRecords(table, query, null);
}

private static async Task<List<Record>> FetchRecords(CloudTable table, 
    TableQuery<Record> query, TableContinuationToken token)
{
    var segment = await table.ExecuteQuerySegmentedAsync(query, token);
    var result = segment.Results.ToList();

    if (segment.ContinuationToken != null)
    {
        result.AddRange(await FetchRecords(table, query, 
                                segment.ContinuationToken));
    }

    return result;
}

```

But what if you’ve a got a CPU-bound operation and want to make use of multiple processor cores of your server to finish that operation faster? In this case we’re talking about parallelism and one thing you need to remember is to not do it in your web server ASP.NET process as it can get recycled any time. What you want to do is set up a side process (maybe a Windows service or a console app that self-hosts a WCF service that you can communicate to through named pipes) that you can offload your CPU-bound work to. If you’re developing a cloud app that back-end process can be a full blown worker role that you can communicate to using a queue.

One last note I would like to make is that there are a special class of apps where doing asynchrony with Task.Run actually makes sense. Yes, you’ve guessed it, they are desktop apps where you really want to release your UI thread as soon as possible.