---
title: Generating clients for your APIs with AutoRest
date: 2016-04-06 13:00:00
permalink: generating-clients-for-your-apis-with-autorest
excerpt: When building Web APIs it's often required to provide client adapters between various programming stacks and raw HTTP REST APIs. These 'clients' can be built manually but it's often a rather tedious task and it adds to your development efforts as you need to keep the clients in sync with...
uuid: 0b47bef8-5092-4140-b774-00b48237d4fa
tags: Tips & Tricks, ASP.NET
---

When building Web APIs it's often required to provide client adapters between various programming stacks and raw HTTP REST APIs. These 'clients' can be built manually but it's often a rather tedious task and it adds to your development efforts as you need to keep the clients in sync with your services as you evolve them.

There had to be a better way and in fact Microsoft faced this issue when they had to generate clients for various Azure REST APIs to be used in various stacks such as .NET, Node, Ruby, Java and Python. They've created and open sourced a tool called [AutoRest](https://github.com/Azure/autorest) that can generate client side code from the Swagger document describing your service. Let's have a look!

### Swagger
Remember WSDL? [Swagger](http://swagger.io/) is something that has taken its place in the RESTful world. It's a spec for the JSON document describing your REST APIs including paths (resources), operations (verbs), parameters and responses and of course representations. Currently it's at version 2.0 and is being widely adopted as it enables interoperability between various services and software stacks. 

#### Enabling Swagger doc in ASP.NET Core
For ASP.NET Web API the most popular library that brings Swagger documentation has been [Swashbuckle](https://github.com/domaindrivendev/Swashbuckle). It registers an endpoint that triggers generation of the document off of the running services. Internally it relies on reflection, API description services, custom attributes and filters and even XML comments. The end result is a JSON document that complies with the [Swagger spec](http://swagger.io/specification/). Swashbuckle is pretty extensible and allows you to affect the way literally any portion of the document will look like so long as it's still within the spec.

There is a work-in-progress [version](https://github.com/domaindrivendev/Ahoy) of Swashbuckle for ASP.NET Core and its package is available through [NuGet](https://www.nuget.org/packages/Swashbuckle.SwaggerGen/6.0.0-rc1-final). Once you have installed the `Swashbuckle.SwaggerGen` package it's time to configure the generator.

```
public void ConfigureServices(IServiceCollection services)
{
    services.AddSwaggerGen();
    services.ConfigureSwaggerSchema(options =>
    {
        options.DescribeAllEnumsAsStrings = true;
    });

    services.ConfigureSwaggerDocument(options =>
    {
        options.SingleApiVersion(new Swashbuckle.SwaggerGen.Info
                                 {
                                     Title = "Book Fast API",
                                     Version = "v1"
                                 });
    });
}
```

`ConfigureSwaggerSchema`, among other properties, allows you to register model filters which you can use to adjust the way documentation is generated for your representations. `ConfigureSwaggerDocument` allows you to register operation and document filters that will fine tune documentation of individual operations or even the whole document. Model, operation and document filters are the main extensibility points of Swashbuckle.

In our case we just provided a short description of the API and also specified that we want enums to be documented rather than their values.

Now we have to add a Swashbuckle middleware to the request pipeline that will handle requests to a special configurable documentation endpoint:

```
public void Configure(IApplicationBuilder app)
{
    app.UseIISPlatformHandler();
    app.UseMvc();

    app.UseSwaggerGen("docs/{apiVersion}");
}
```

If we don't specify the route Swashbuckle will use the default `swagger/{apiVersion}/swagger.json`.

If you launch the app and hit the specified route we should get a JSON document in response. It's a valid Swagger 2.0 document albeit not ideal. Things to watch out for:

- Operation identifiers are quite ugly as they are formed by concatenating your controller and action names together with HTTP verbs and parameters. AutoRest uses operation identifiers to derive method names for your client interfaces so you want to make sure you control these identifiers.
- All responses include default 200 only even though your actions may return 201 or 204 as success code and chance are they can produce some 40x.
- If you return IActionResult rather than an actual representation the response won't contain a reference to the corresponding schema. And you will retrun IActionResult from at least your POST and DELETE methods.
- `produces` properties of the operations are empty and you probably want to include content types that your API supports (e.g. `application/json`).
- Parameters and properties in your representations are lacking descriptions and while this may not be such an issue for you, wouldn't it be nice if those descriptions were included as XML comments in generated classes?

Here's what a POST operation from my `BookingController` would look like:

```
"/api/accommodations/{accommodationId}/bookings": {
	"post": {
		"tags": ["Booking"],
		"operationId": "ApiAccommodationsByAccommodationIdBookingsPost",
		"produces": [],
		"parameters": [{
			"name": "accommodationId",
			"in": "path",
			"required": true,
			"type": "string"
		},
		{
			"name": "bookingData",
			"in": "body",
			"required": false,
			"schema": {
				"$ref": "#/definitions/BookingData"
			}
		}],
		"responses": {
			"200": {
				"description": "OK"
			}
		},
		"deprecated": false
	}
}
```

Let's fix these issues!

#### Getting better documentation with Swashbuckle attributes and filters

Remember that `AddSwaggerGen` call? Beyond anything else it registers default operation filters that will handle special Swashbuckle attributes that you can use to control operation identifiers and responses. The attributes are: `SwaggerOperation`, `SwaggerResponse` and `SwaggerResponseRemoveDefaults`.

Let's have a look at what our POST method could look like once decorated with aforementioned attributes:

```
[HttpPost("api/accommodations/{accommodationId}/bookings")]
[SwaggerOperation("create-booking")]
[SwaggerResponseRemoveDefaults]
[SwaggerResponse(System.Net.HttpStatusCode.Created, Type = typeof(BookingRepresentation))]
[SwaggerResponse(System.Net.HttpStatusCode.BadRequest, Description = "Invalid parameters")]
[SwaggerResponse(System.Net.HttpStatusCode.NotFound, Description = "Accommodation not found")]
public async Task<IActionResult> Create([FromRoute]Guid accommodationId, [FromBody]BookingData bookingData)
{
    try
    {
        if (ModelState.IsValid)
        {
            var booking = await service.BookAsync(accommodationId, mapper.MapFrom(bookingData));
            return CreatedAtAction("Find", mapper.MapFrom(booking));
        }

        return HttpBadRequest();
    }
    catch (AccommodationNotFoundException)
    {
        return HttpNotFound();
    }
}
```

Even though I've chosen a dash style for my operations identifiers (i.e. `create-booking`) AutoRest will actually generate a method called `CreateBooking` in my client interface which is very nice! I also specified that upon success the operation will return 201 and the Swagger document should include a reference to `BookingRepresentation` in the 201 response. I had to remove the default 200 response with `SwaggerResponseRemoveDefaults` attribute.

I also included a 404 response with an appropriate description. Please note that HTTP status codes are actually keys in the dictionary of responses within an operation and thus there can be only one response with a particular status code. If you have multiple 404's you will need to come up with a combined description in `SwaggerResponse` attribute.

So far so good but let's address the missing content type issue. One way to do that is to add a custom operation filter that will add supported content types to all of our operations:

```
internal class DefaultContentTypeOperationFilter : IOperationFilter
{
    public void Apply(Operation operation, OperationFilterContext context)
    {
        operation.Produces.Clear();
        operation.Produces.Add("application/json");
    }
}
```

As it was mentioned above operation filters are added in `ConfigureSwaggerDocument` so let's do that:

```
services.ConfigureSwaggerDocument(options =>
{
    options.SingleApiVersion(new Swashbuckle.SwaggerGen.Info
                             {
                                 Title = "Book Fast API",
                                 Version = "v1"
                             });
    options.OperationFilter<DefaultContentTypeOperationFilter>();
});
```

#### Getting even better documentation with XML comments

Swashbuckle can also extract XML comments that you can add to your action methods as well as to models. XML comments are extracted by default but you need to enable emission of build artifacts in by going to your MVC project's Properties and selecting 'Produce output on build' option on the Build page. 

![ASP.NET Core app build properties page](https://blogcontent.azureedge.net/AspNetCoreProduceArtifacts.png)

By default the artifacts (.dll, .pdb and the desired .xml) will be put into 'artifacts' folder in your solution under corresponding project, build configuration and framework type folders. When you publish and choose to create NuGet packages for your code the artifacts will be in approot\packages\{YourProjectName}\{PackageVersion}\lib\{FrameworkType} folder. Why is this important? Because you need to provide a path to the XML file to Swashbuckle and with ASP.NET Core these paths are going to be different depending on whether you just locally build or publish.

This [configuration code](https://github.com/dzimchuk/book-fast-api/blob/master/src/BookFast.Api/Swagger/SwaggerExtensions.cs) will work with local builds but not with published apps and it has to be used in development environment only. Moreover it's not compatible with RC2 bits of ASP.NET Core. But we seem to be moving away from the topic of this post.

Anyway, once we have decorated our code with nice XML comments let's have a look at the final version for the POST Booking operation documentation:

```
"/api/accommodations/{accommodationId}/bookings": {
	"post": {
		"tags": ["Booking"],
		"summary": "Book an accommodation",
		"operationId": "create-booking",
		"produces": ["application/json"],
		"parameters": [{
			"name": "accommodationId",
			"in": "path",
			"description": "Accommodation ID",
			"required": true,
			"type": "string"
		},
		{
			"name": "bookingData",
			"in": "body",
			"description": "Booking details",
			"required": false,
			"schema": {
				"$ref": "#/definitions/BookingData"
			}
		}],
		"responses": {
			"201": {
				"description": "Created",
				"schema": {
					"$ref": "#/definitions/BookingRepresentation"
				}
			},
			"400": {
				"description": "Invalid parameters"
			},
			"404": {
				"description": "Accommodation not found"
			}
		},
		"deprecated": false
	}
}
```

Now we're talking! Much better than the initial version. Let's go generate the client!

### AutoRest
You can install AutoRest with Chocolatey or simply grab a package from NuGet and unpack it somewhere. Then you need to request a Swagger document from your service and save it. Now you're ready to run AutoRest:

```
f:\dev\tools\AutoRest>AutoRest.exe -Namespace BookFast.Client -CodeGenerator CSharp -Modeler Swagger -Input f:\book-fast-swagger.json -PackageName BookFast.Client -AddCredentials true

The Microsoft.Rest.ClientRuntime.2.1.0 nuget package is required to compile the
generated code.
Finished generating CSharp code for f:\book-fast-swagger.json.
```

[Here](https://github.com/Azure/autorest/blob/master/Documentation/cli.md) you can find a complete documentation for command line parameters. I chose C# generator but AutoRest also supports Java, Node, Python and Ruby. 

In order to build the generated code you also need to add `Microsoft.Rest.ClientRuntime` NuGet package that brings all the necessary plumbing.

**UPDATE:** AutoRest has been reimplemented as a Node application since this post was published. You install it by running `npm install -g autorest` and the equivalent command to generate the client code will be:

```
autorest --input-file=f:\booking.json --csharp --namespace=BookFast.Booking.Client --add-credentials
```

#### Exploring generated client code

AutoRest generated classed for my representations together with `IBookFastAPI` interface and the corresponding implementation class. All operations are declared as asynchronous and I can also control Json.NET serializer settings. Let's have a look at the POST Booking contract:

```
/// <summary>
/// Book an accommodation
/// </summary>
/// <param name='accommodationId'>
/// Accommodation ID
/// </param>
/// <param name='bookingData'>
/// Booking details
/// </param>
/// <param name='customHeaders'>
/// The headers that will be added to request.
/// </param>
/// <param name='cancellationToken'>
/// The cancellation token.
/// </param>
Task<HttpOperationResponse<BookingRepresentation>> CreateBookingWithHttpMessagesAsync(
    string accommodationId, 
    BookingData bookingData = default(BookingData), 
    Dictionary<string, List<string>> customHeaders = null, 
    CancellationToken cancellationToken = default(CancellationToken));
```

The interface allows me to provide custom headers and cancellation tokens for each operation. Nice! Also notice the XML comments, some of them (summary, API parameters) are coming from the Swagger document. XML comments are also added to generated models.

The implementation handles all the nitty gritty details of constructing the request and handling the response. Note that it respects response codes that we insured to be present in our Swagger doc:

```
// sending request is omitted

HttpStatusCode _statusCode = _httpResponse.StatusCode;
cancellationToken.ThrowIfCancellationRequested();
string _responseContent = null;

if ((int)_statusCode != 201 && (int)_statusCode != 400 && (int)_statusCode != 404)
{
    var ex = new HttpOperationException(string.Format("Operation returned an invalid status code '{0}'", _statusCode));
    ex.Request = new HttpRequestMessageWrapper(_httpRequest, _requestContent);
    ex.Response = new HttpResponseMessageWrapper(_httpResponse, _responseContent);
    if (_shouldTrace)
    {
        ServiceClientTracing.Error(_invocationId, ex);
    }
    _httpRequest.Dispose();
    if (_httpResponse != null)
    {
        _httpResponse.Dispose();
    }
    throw ex;
}

// Create Result
var _result = new HttpOperationResponse<BookingRepresentation>();
_result.Request = _httpRequest;
_result.Response = _httpResponse;

// Deserialize Response
if ((int)_statusCode == 201)
{
    _responseContent = await _httpResponse.Content.ReadAsStringAsync().ConfigureAwait(false);
    try
    {
        _result.Body = SafeJsonConvert.DeserializeObject<BookingRepresentation>(_responseContent, this.DeserializationSettings);
    }
    catch (JsonException ex)
    {
        _httpRequest.Dispose();
        if (_httpResponse != null)
        {
            _httpResponse.Dispose();
        }
        throw new SerializationException("Unable to deserialize the response.", _responseContent, ex);
    }
}

if (_shouldTrace)
{
    ServiceClientTracing.Exit(_invocationId, _result);
}

return _result;
```

If the response contains anything besides expected 201, 400 or 404 it will throw as the service is behaving in an undocumented way. Note that the method returns `HttpOperationResponse` that may or may not contain the actual payload. It is your responsibility to check for documented 40x responses.

#### Authentication

Most APIs require authentication of some kind and  because we used `-AddCredentials true` command line option AutoRest generated a special version of the client for us that allows us to provide credentials.

```
var credentials = new TokenCredentials("<bearer token>");

var client = new BookFast.Client.BookFastAPI(new Uri("http://localhost:50960", UriKind.Absolute), credentials);
var result = await client.CreateBookingWithHttpMessagesAsync("12345", new BookFast.Client.Models.BookingData
             {
                 FromDate = DateTime.Parse("2016-05-01"),
                 ToDate = DateTime.Parse("2016-05-08")
             });
```

`Microsoft.Rest.ClientRuntime` provides two variants of credentials that can be passed to the constructor of our client: `TokenCredentials` and `BasicAuthenticationCredentials`. If you use a custom authentication mechanism you can create your own implementation of `ServiceClientCredentials`. Its job is to add necessary details to the request object before it will be sent over the wire.

Do you guys still manually write clients for your APIs?