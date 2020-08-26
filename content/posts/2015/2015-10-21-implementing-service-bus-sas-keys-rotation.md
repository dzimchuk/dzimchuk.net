---
title: Implementing Service Bus SAS keys rotation
date: 2015-10-21 15:46:35
permalink: implementing-service-bus-sas-keys-rotation
excerpt: Shared Access Signature (SAS) authentication provides a simple and flexible option to authenticate requests to Service Bus. You can define access rules on the entire namespace as well as individual entities such as queues, relays, topics and Event Hubs. While this is also possible with ACS...
uuid: de36c93c-89d3-4804-9ce8-5d1bb03d8384
tags: Azure Service Bus
---

Shared Access Signature (SAS) authentication provides a simple and flexible option to authenticate requests to Service Bus. You can define access rules on the entire namespace as well as individual entities such as queues, relays, topics and Event Hubs. While this is also possible with ACS authentication, what sets SAS option apart is the ability to grant access to Service Bus entities without giving out keys. This is achieved by issuing [SAS tokens](https://azure.microsoft.com/en-us/documentation/articles/service-bus-sas-overview/) (or signatures, although the actual signatures are just part of them) that are bound to particular authorization policies and have a finite lifetime.

In addition to managing SAS token expiration a common requirement is the ability to revoke issued tokens to prevent further undesired access to Service Bus entities and make consumers undergo a procedure of requesting new tokens.

![Service Bus, consumer and a SAS token service](https://blogcontent.azureedge.net/53a9fd59-e3ed-4623-8a38-614cf0911632.png)

SAS tokens include a signature which is a keyed hash (HMAC-SHA256) of the resource URL and the expiration period. By changing both primary and secondary keys of the authorization policy that is used for issued tokens we effectively invalidate these tokens.

It is also recommended to implement rotation of SAS keys on a regular basis so that keys that have been compromised could not be used to access Service Bus. Primary and secondary keys allow us to implement rotation without affecting well behaving consumers. While the key that was used to generate a signature is present in either primary or secondary position the token will be successfully validated by Service Bus. It is [recommended](https://azure.microsoft.com/en-us/documentation/articles/service-bus-shared-access-signature-authentication/#regenerate-and-revoke-keys-for-shared-access-authorization-rules) to use a primary key to generate tokens and during rotation replace a secondary key with the old primary key and assign a newly generated key to the primary key. It will allow tokens signed with the old primary key to still work if they haven't yet expired.

## How do token expiration and keys rotation periods correlate?

It turns out the expiration period should not exceed the rotation one otherwise there will be a chance for a token to span over more than 2 rotation periods after which both keys will be changed.

![SAS key rotation periods and token lifetimes](https://blogcontent.azureedge.net/5a77c79b-a101-406d-9dc7-1cfd94823367.png)

Consumers should request new tokens before their existing ones expire to insure uninterrupted access to Service Bus.

## Rotating keys

Let's implement a simple [proof of concept](https://github.com/dzimchuk/SASRotation). We're going to define separate Read, Write and Manage authorization policies on a Service Bus queue:

![Authorization policies of a Service Bus queue](https://blogcontent.azureedge.net/7cc5408e-bbba-4828-a556-aa7cbda30c73.png)

Our POC will contain a token service similar to the one shown above that will be issuing separate SAS tokens for read and write operations against a Service Bus queue:

```
[RoutePrefix("api")]
public class TokenController : ApiController
{
    private readonly ITokenService tokenService;

    public TokenController(ITokenService tokenService)
    {
        this.tokenService = tokenService;
    }

    [Route("readtoken")]
    public async Task<Token> GetReadToken()
    {
        return new Token { SharedAccessSignature = await tokenService.GetReadSharedAccessSignature() };
    }

    [Route("writetoken")]
    public async Task<Token> GetWriteToken()
    {
        return new Token { SharedAccessSignature = await tokenService.GetWriteSharedAccessSignature() };
    }
}

```

The service uses a connection string of the Manage policy to get queue description and locate a Read or Write authorization rule.

![Service Bus queue authorization policy's connection strings](https://blogcontent.azureedge.net/b246fa20-ee54-456f-8ce9-c8f913c87c7d.png)

It will then use the rule's primary key to create a SAS token using `SharedAccessSignatureTokenProvider.GetSharedAccessSignature` method.

```
internal class TokenService : ITokenService
{
    private readonly IConfiguration configuration;

    public TokenService(IConfiguration configuration)
    {
        this.configuration = configuration;
    }

    public Task<string> GetReadSharedAccessSignature()
    {
        var ruleName = configuration.Find("ReadAuthorizationRuleName");
        return GetSharedAccessSignature(ruleName);
    }

    public Task<string> GetWriteSharedAccessSignature()
    {
        var ruleName = configuration.Find("WriteAuthorizationRuleName");
        return GetSharedAccessSignature(ruleName);
    }

    private async Task<string> GetSharedAccessSignature(string ruleName)
    {
        var queueName = configuration.Find("QueueName");

        var manager = NamespaceManager.CreateFromConnectionString(configuration.Find("ServiceBusConnectionString"));
        var description = await manager.GetQueueAsync(queueName);

        SharedAccessAuthorizationRule rule;
        if (!description.Authorization.TryGetSharedAccessAuthorizationRule(ruleName, out rule))
            throw new Exception($"Authorization rule {ruleName} was not found");

        var address = ServiceBusEnvironment.CreateServiceUri("sb", configuration.Find("Namespace"), string.Empty);
        var queueAddress = address + queueName;

        return SharedAccessSignatureTokenProvider.GetSharedAccessSignature(ruleName, rule.PrimaryKey, queueAddress,
            TimeSpan.FromSeconds(int.Parse(configuration.Find("SignatureExpiration"))));
    }
}

```

The POC token service doesn't require any authentication, in real world of course you need to use control access to it.

Our POC will also contain a rotation routine implemented as a scheduled web job that would rotate encryption keys of both Read and Write rules on configurable interval:

```
[NoAutomaticTrigger]
public static void RegenerateKey(TextWriter log)
{
    var manager = NamespaceManager.CreateFromConnectionString(ConfigurationManager.AppSettings["ServiceBusConnectionString"]);
    var description = manager.GetQueue(ConfigurationManager.AppSettings["QueueName"]);

    RegenerateKey(description, ConfigurationManager.AppSettings["ReadAuthorizationRuleName"], log);
    RegenerateKey(description, ConfigurationManager.AppSettings["WriteAuthorizationRuleName"], log);

    manager.UpdateQueue(description);
}

private static void RegenerateKey(QueueDescription description, string ruleName, TextWriter log)
{
    SharedAccessAuthorizationRule rule;
    if (!description.Authorization.TryGetSharedAccessAuthorizationRule(ruleName, out rule))
        throw new Exception($"Authorization rule {ruleName} was not found");

    rule.SecondaryKey = rule.PrimaryKey;
    rule.PrimaryKey = SharedAccessAuthorizationRule.GenerateRandomKey();

    log.WriteLine($"Authorization rule: {ruleName}\nPrimary key: {rule.PrimaryKey}\nSecondary key: {rule.SecondaryKey}");
}

```

Let's create a console sender application that will request SAS tokens from the token service and use them to (well you guessed it) send messages to the queue:

```
class Program
{
    static void Main(string[] args)
    {
        Console.WriteLine("Press Ctrl+C to exit.");
        SendMessages().Wait();
    }

    private static async Task SendMessages()
    {
        var client = await GetQueueClientAsync();
        while (true)
        {
            try
            {
                var message = new BrokeredMessage(Guid.NewGuid());
                await client.SendAsync(message);

                Console.WriteLine("{0} Sent {1}", DateTime.Now, message.GetBody<Guid>());
            }
            catch(UnauthorizedAccessException e)
            {
                Console.WriteLine(e.Message);
                client = await GetQueueClientAsync();
            }

            await Task.Delay(TimeSpan.FromSeconds(8));
        }
    }

    private static async Task<QueueClient> GetQueueClientAsync()
    {
        var sharedAccessSignature = await GetTokenAsync();

        var address = ServiceBusEnvironment
            .CreateServiceUri("sb", ConfigurationManager.AppSettings["Namespace"], string.Empty);
        var messagingFactory = MessagingFactory
            .Create(address, TokenProvider.CreateSharedAccessSignatureTokenProvider(sharedAccessSignature));
        return messagingFactory.CreateQueueClient(ConfigurationManager.AppSettings["QueueName"]);
    }

    private static async Task<string> GetTokenAsync()
    {
        var client = new HttpClient();
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        var response = await client.GetStringAsync(ConfigurationManager.AppSettings["WriteTokenUrl"]);
        var jObject = JObject.Parse(response);
        return jObject.GetValue("SharedAccessSignature").ToString();
    }
}

```

We use `MessagingFactory` to construct a `QueueClient` instance as it has an overload accepting a token provider. The sender will keep sending messages until it gets `UnauthorizedAccessException` which could be due an expired token or due to updated encryption keys in the Read policy.

![Sender output](https://blogcontent.azureedge.net/1431be4d-c08c-4ea3-a347-600c3e3dd227.png)

You can actually differentiate these two situations. When a SAS token expires you get an error like:

```
40105: Malformed authorization token. TrackingId:b74dd921-eada-421e-8567-e5265effcbc9_G11,TimeStamp:10/21/2015 4:03:44 PM

```

When a signature is no longer accepted the error reads:

```
40103: Invalid authorization token signature. TrackingId:b577b054-18ff-4681-9f44-5b0b33b6f8ea_G17,TimeStamp:10/21/2015 4:05:54 PM

```

Our POC token service sets expiration period to 60 seconds however my testing showed that tokens start being rejected by Service Bus as expired only in 5-6 minutes. When you rotate encryption keys twice tokens get rejected with error 40103 immediately.