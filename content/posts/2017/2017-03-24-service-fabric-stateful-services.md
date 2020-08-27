---
title: Service Fabric stateful services
date: 2017-03-24T15:31:00.000Z
lastmod: 2018-03-15T20:25:31.000Z
permalink: service-fabric-stateful-services
excerpt: Service Fabric is a great compute platform for your applications. But did you know it is also a storage platform? Stateful services programming model enables this capability. Stateful services allow you to persist data right on the same nodes where your services are executing.
uuid: c9725aee-351f-4ec1-9a8d-b6603fdcafa5
tags: Azure Service Fabric
---

Service Fabric is a great compute platform for your applications. But did you know it is also a storage platform? Stateful services programming model enables this capability.

Stateful services allow you to persist data right on the same nodes where your services are executing. This allows you to greatly reduce back pressure on your external storage as unlike with stateless services you don't have to restore context and state by making network requests to external storage systems.

The state is persisted in so called [reliable collections](https://docs.microsoft.com/en-us/azure/service-fabric/service-fabric-reliable-services-reliable-collections). They are called reliable as the state is replicated across replicas and you have transaction support when accessing and modifying it. There are two flavors of reliable collections available for you: dictionaries and queues.

## Availability

High availability of the state persisted within stateful services is achieved with replicas. Each replica is an instance of your stateful services that contains a copy of the service state. There is a primary replica that can be used for read and write operations and this is the only replica that can be used for write operations.

Changes to state from write operations are replicated to secondary replicas. The secondary replicas are called active secondary because they also support read operations. By default, only the primary replica will open up the endpoint. You need to opt in by setting `listenOnSecondary` flag when creating a communication listener.

When the primary replica goes down Service Fabric chooses one of the secondary replicas and promotes it to primary. At the same time the infrastructure is taking care of provisioning the lost replica on another node.

## Scalability

Scalability of stateful services is achieved with partitions. Contrast this to stateless services where both scalability and availability is achieved with additional service instances. In stateful services adding additional replicas won't be enough as you still communicate with a single primary replica for read/write operations.

By partitioning your state horizontally you marshal requests to partitions that contain data related to these requests. Each partition consists of a replica set with a single primary replica and multiple active secondary replicas. In other words, you have the same state replication as described above with a single partition. Service Fabric makes sure to distribute replicas of partitions across nodes so that secondary replicas of a partition do not end up on the same node as the primary replica.

![Partition replicas are spread across the cluster](https://blogcontent.azureedge.net/2017/03/Service-Fabric-partitions.png)

In order to call an endpoint of a particular partition you need to resolve its current address within the cluster. I've already touched upon endpoint resolution process [before](https://dzimchuk.net/implementing-a-rest-client-for-internal-communication-in-service-fabric/) so might want to check out that post. You normally use infrastructure client components such as `ServicePartitionResolver` or a more sophisticated `ServicePartitionClient` to do the job and you need to pass a `ServicePartitionKey` to them to identify the partition.

Now it becomes obvious that you need a consistent way to create partition keys otherwise you won't be able to access data. There can be many approaches to accomplish that and I will describe one later in this post. But before we move on to a practical example I would like to mention another aspect of communication with stateful services.

Partitioning strategy that you choose for services is an implementation detail. You should *not* expose it to external callers because a) they are going to have to jump through the endpoint resolution hoops and you're going to have to expose internal cluster services as well; and b) even though it's complicated to change the strategy after the fact, you still may want to do so by introducing a new service or making a more drastic change to your application. Instead, external service should call your application through well known stable public endpoints.

Normally you would expose stateless services in front of your internal stateful services. The stateless services play the role of façade for the stateful ones. They can scale independently and will take care of endpoint resolution and calling the appropriate partitions of your stateful services.

![Stateless façade for stateful services](https://blogcontent.azureedge.net/2017/03/SF-internal-communication--stateless-facade--1-.png)

You may also define different node types in your cluster. It allows you to have machines of different size and set placement rules for the cluster manager. Moreover, if you set instance count for your stateless façade services to -1 it will make the cluster manager deploy one instance to each machine with respect to placement rules. You can easily scale the façade by adding more nodes of the appropriate type to the cluster.

## Example of a stateful service

In the microservice primer [post](https://dzimchuk.net/microservices-primer-with-azure-service-fabric/) I've described a sample solution called BookFast that allows organizations to provide facilities and accommodations for rental and customers to book them through the system. One of the core services of the solution is the actual booking service.

The booking service is responsible for accepting new booking requests, keeping track of bookings made and availability of accommodations. Given the anticipated massive load of requests from all over the globe it makes this service a perfect candidate to be turned into a stateful one. We can spread facilities over multiple partitions and have the façade stateless service (which in this case is an MVC web app) dispatch booking requests to target partitions depending on the facility the requests are made for.

![Booking stateful service](https://blogcontent.azureedge.net/2017/03/BookFast---SF---stateful.png)

Facilities are identified with Guids and I've used a simple partitioning scheme where a partition is determined by the first character of the `Guid` string representation. This gives us 16 partitions (0-9, A-F) and we can implement a common helper method to calculate the partition number:

```
public static long ToPartitionKey(this Guid id)
{
    var first = id.ToString().ToUpperInvariant().First();
    var offset = first - '0';
    if (offset <= 9)
    {
        return offset;
    }

    return first - 'A' + 10;
}
```

Here's an example of a proxy operation of the stateless façade that registers a booking request:

```
public async Task BookAsync(Guid facilityId, Guid accommodationId, BookingDetails details)
{
    var data = mapper.MapFrom(details);
    data.AccommodationId = accommodationId;

    var result = await partitionClientFactory.CreatePartitionClient(new ServicePartitionKey(facilityId.ToPartitionKey())).InvokeWithRetryAsync(async client =>
    {
        var api = await client.CreateApiClient();
        return await api.CreateBookingWithHttpMessagesAsync(accommodationId, data);
    });
    
    if (result.Response.StatusCode == HttpStatusCode.NotFound)
    {
        throw new AccommodationNotFoundException(accommodationId);
    }
}
```

Often your stateful services will require external data. For instance, the booking services needs details of facilities and accommodations and this data is managed by another service (FacilityService). Now we have an issue! We've worked so hard to keep data together with stateful services so that we don't have to pay the price of external calls and now we seem to still have to make these calls upon each request! This does not eliminate benefits of storing the primary state locally but still is something to watch out for.

We have a few options to reduce the impact of extern calls from stateful services:

1. Caching. A straight forward and quite efficient option in most cases. Our sample booking service relies on Redis to cache facility and accommodation details it retrieves from the facility service.
2. Data sync. We can implement a synchronization process (either as a separate stateless service or within the stateful service itself) that would pull the data from external sources periodically and store it in appropriate partitions of the stateful service.
3. We can make service managing catalog data push it to stateful services using this data. If we don't want to introduce additional coupling we could implement an asynchronous push over a queue.