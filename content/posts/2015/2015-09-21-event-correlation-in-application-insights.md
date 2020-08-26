---
title: Event correlation in Application Insights
date: 2015-09-21 13:20:30
permalink: event-correlation-in-application-insights
excerpt: Application Insights uses several contextual properties for event correlation. The most generic one is Operation Id that allows us to analyze a series of events and traces as part of a single operation. Depending on the application type there can be additional correlation properties.
uuid: e3e346b4-43f1-4bc9-8a99-c9fcad84529a
tags: Azure Services, Azure Application Insights
---

Application Insights uses several contextual properties for event correlation. The most generic one is Operation Id that allows us to analyze a series of events and traces as part of a single operation. Depending on the application type there can be additional correlation properties. For example, if we're talking about web requests these are also Session Id and User Id that allow us to group events and traces by the security and session context in which they occurred.

In a lot of applications that incorporate various micro and not only services it is often important to correlate events that happen across these services. It gives us a business workflow view of the various events that happen in the application, its components and services. It requires us to implement operation or activity Id management and propagation. To demonstrate this I'm going to show you how to propagate an Operation Id of a web request that's made to the [FixItApp](https://github.com/dzimchuk/azure-app-insights) to a background task running as a [WebJob](https://github.com/dzimchuk/azure-app-insights/tree/master/C%23/MyFixIt.CreateJob) that is triggered through a storage queue.

## Demo project

FixItApp has an option to persist created tasks asynchronously using a background process.

There is a setting in web.config called 'UseQueues' that needs to be set to `true`. If you're running in Azure Web App you can set this property on the portal instead. There is also a continuous WebJob that's triggered by the storage queue where the application sends messages about created tasks. You can deploy the WebJob to Azure or run it locally.

Run the application and create a FixIt task. Make sure to add a picture to upload with it. Then open up the Application Insights Search blade and look for the POST web request event. On the event properties blade click the three dots button to show all properties.

![Web request properties](https://blogcontent.azureedge.net/0a78334c-815a-4d93-b48d-feaefdd8f15f.png)

Among others you can see correlation properties such as Operation Id, Session Id and User Id. Right from this blade you can search for telemetry events that are associated with these properties. Right-click the Operation Id property and select Search.

![Search by Operation Id (no database call trace message)](https://blogcontent.azureedge.net/61290539-d7ff-4a96-89ef-3a0e10ae7f9f.png)

There are the request event itself, our custom Create event from [LoggingTaskService](https://github.com/dzimchuk/azure-app-insights/blob/master/C%23/MyFixIt/Services/LoggingTaskService.cs), a custom trace for the image upload call and two dependency calls to Azure blob storage. This is the same telemetry you would get if you chose 'Show all telemetry for this request' link on the POST request overview blade that's shown above.

The actual database call is made by the WebJob and is not associated with the request which is technically correct as it happened asynchronously in a separate process. But what if we want to correlate it with the original request that triggered the operation?

## Propagating Operation Id to the WebJob

Before we can propagate Operation Id from the web application to the background process we need to understand how it gets managed. When you create an instance of `TelemetryClient` it's context is empty. It will get populated by the initializer when it's time to send data to Application Insights. This is done by telemetry initializers. There are some default ones and you can add your own.

If you open up ApplicationInsights.config in the web application you will see that there is a default Operation Id initializer called `OperationIdTelemetryInitializer` from `Microsoft.ApplicationInsights.Web` namespace. It sets `ITelemetry.Context.Operation.Id` property of our `TelemetryClient` instances with the Id from the `RequestTelemetry` object. `RequestTelemetry` is a special type of telemetry object that's initialized when the request event is captured by Application Insights.

So for any `TelemetryClient` instance that we create in scope of a request we're going to be using `RequestTelemetry.Id` property value as an Operation Id. If we want to propagate this value to other processes we need to take it from `RequestTelemetry.Id`, and not from `TelemetryClient.Context.Operation.Id` as it doesn't get initialized immediately.

We need to grab the value as we start processing the request and save it somewhere so we could use it when making a request to a remote service. As `RequestTelemetry` is persisted in the `Items` collection of `HttpContext` we can write an action filter like this:

```
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false)]
public class AiCorrelationAttribute : FilterAttribute, IActionFilter
{
    private const string RequestTelemetryKey = "Microsoft.ApplicationInsights.RequestTelemetry";

    public void OnActionExecuting(ActionExecutingContext filterContext)
    {
        if (filterContext.HttpContext.Items.Contains(RequestTelemetryKey))
        {
            var requestTelemetry = filterContext.HttpContext.Items[RequestTelemetryKey] as RequestTelemetry;
            if (requestTelemetry == null)
                return;

            CorrelationManager.SetOperationId(requestTelemetry.Id);
        }
    }

    public void OnActionExecuted(ActionExecutedContext filterContext)
    {
    }
}

```

We can register this filter in the global filter collection so it gets fired upon each request. The `CorrelationManager` is a convenient component to persist the Operation Id in the logical `CallContext`:

```
namespace MyFixIt.Common
{
    public static class CorrelationManager
    {
        private const string OperationIdKey = "OperationId";

        public static void SetOperationId(string operationId)
        {
            CallContext.LogicalSetData(OperationIdKey, operationId);
        }

        public static string GetOperationId()
        {
            var id = CallContext.LogicalGetData(OperationIdKey) as string;
            return id ?? Guid.NewGuid().ToString();
        }
    }
}

```

By storing it in the logical `CallContext` we make it available from anywhere and we're going to use it when sending a queue message:

```
public async Task SendMessageAsync(FixItTask fixIt)
{
    CloudQueue queue = queueClient.GetQueueReference(FixitQueueName);
    await queue.CreateIfNotExistsAsync();

    var fixitJson = JsonConvert.SerializeObject(new FixItTaskMessage
                    {
                        Task = fixIt,
                        OperationId = CorrelationManager.GetOperationId()
                    });
    CloudQueueMessage message = new CloudQueueMessage(fixitJson);

    await queue.AddMessageAsync(message);
}

```

Because we use a queue to communicate with the WebJob we need to pass the Operation Id as part of the message. If we were talking to a remote web service we could use a custom header (HTTP or SOAP depending on the type of the service).

The WebJob is a console application and we haven't added any special Application Insights components to it except for Microsoft.ApplicationInsights package so we could do custom tracing with `TelemetryClient`. Thus we need to first get the Operation Id from the message as we start processing it and make sure to initialize `TelemetryClient` instance(s) with it.

The first part is accomplished right in the job method:

```
public class TaskJob
{
    private readonly IFixItTaskRepository repository;

    public TaskJob(IFixItTaskRepository repository)
    {
        this.repository = repository;
    }

    public async Task ProcessQueueMessage([QueueTrigger("fixits")] FixItTaskMessage message, 
        TextWriter log)
    {
        CorrelationManager.SetOperationId(message.OperationId);

        await repository.CreateAsync(message.Task);

        log.WriteLine("Created task {0}", message.Task.Title);
    }
}

```

We use the `CorrelationManager` again to persist the Operation Id in the logical `CallContext`.

Then we need to add a custom telemetry initializer to TelemetryConfiguration so that we could pass the Operation Id to TelemetryClient instances:

```
private static void InitializeAppInsights()
{
    TelemetryConfiguration.Active.InstrumentationKey = 
        ConfigurationManager.AppSettings["ApplicationInsights.InstrumentationKey"];
    TelemetryConfiguration.Active.TelemetryInitializers.Add(new CorrelatingTelemetryInitializer());
}

```

The telemetry initializer looks as simple as this:

```
internal class CorrelatingTelemetryInitializer : ITelemetryInitializer
{
    public void Initialize(ITelemetry telemetry)
    {
        telemetry.Context.Operation.Id = CorrelationManager.GetOperationId();
    }
}

```

## Testing Operation Id propagation

We're ready to test our solution. Run the same task creation operation as before and check out the POST request on the portal.

![Search by Operation Id (this time it shows the database call trace message)](https://blogcontent.azureedge.net/d2afbdaa-7c5a-40a7-affc-1417e8c92504.png)

This time the database call that was done by the WebJob is listed as part of request events. What's really cool is that when we see this single trace we can navigate to a web request that happened on the web server that eventually triggered this operation.

![Database call trace event with the link to web request](https://blogcontent.azureedge.net/b156cc4f-596e-4408-bd96-df143b237a42.png)

Now it needs to be understood that sometimes it may not be desirable. We're seeing the event as part of a request while it's technically not and may have well happened on another machine. Whether you want to propagate Operation Id to background tasks or not will depend on your particular scenario. You may choose a custom property instead of Operation Id that you can set when calling Track* methods on `TelemetryClient`. You will be able to search by the custom property on the portal.

In background processes such as WebJobs you can use a custom telemetry initializer to at least associate all of the events that happen as part of the background operation and you can propagate your custom correlation property to make the background operation a part of a larger activity.