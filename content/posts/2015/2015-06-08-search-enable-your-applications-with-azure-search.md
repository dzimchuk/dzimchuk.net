---
title: Search enable your applications with Azure Search
date: 2015-06-08 17:55:21
permalink: search-enable-your-applications-with-azure-search
excerpt: Azure Search is a search as a service offering that gives developers total control over indexing and searching of their content. It’s the control that sets Azure Search apart from public search offerings such as Google Custom Search.
uuid: 6e803b05-431b-4f89-ae30-91a9f59520b7
tags: Azure Services, Azure Search
---

[Azure Search](http://azure.microsoft.com/en-us/services/search/ "Azure Search") is a search as a service offering that gives developers total control over indexing and searching of their content. It’s the control that sets Azure Search apart from public search offerings such as [Google Custom Search](https://developers.google.com/custom-search/ "Google Custom Search"). With Azure Search you, the developer, define what, how and how often will be indexed and how search UI, search and suggestion results will look like. It will require more work on your side as a developer but it’s that trade-off you’re likely to make to deliver precisely the search experience for your applications you need.

In this post I’m going walk you through adding search capabilities to your applications. I’m going to use my blog as a sample application. But be aware that Azure Search is not limited to web applications. It exposes its functionality through a set of [RESTful services](https://msdn.microsoft.com/en-us/library/azure/dn798935.aspx "Azure Search REST API") so it can be used from just about any application that speaks HTTP.

## Creating a search service

It can be done either on the new preview portal or programmatically using [Azure Management API](https://azure.microsoft.com/en-us/documentation/articles/search-get-started-management-api/).

![Azure Search on the Portal](https://blogcontent.azureedge.net/585efac3-a870-474f-9d7a-ae8af9fd5a91.png)

There are currently two pricing tiers: Standard (starts with $250/mo, dedicated resources, scalable up to 36 search units, up to 15 million documents per partitions, up to 12 partitions per service) and Free (shared resources, no scale, max 50Mb of storage, 10K documents and 3 indexes, enough for a blog ;)).

## Creating an index

Index is a container for your documents. It’s not just an ‘index’ per se referencing documents in the original store. Azure Search index will actually contain either full or shortened versions of the documents. When creating an index you define document structure by identifying what fields there are in the document and how data in these fields will be used. For a typical blog engine an index definition can look like this:

```
{
  "name": "test",
  "fields": [
    {
      "name": "Id",
      "type": "Edm.String",
      "key": true,
      "searchable": false,
      "filterable": false,
      "sortable": false,
      "facetable": false,
      "retrievable": true
    },
    {
      "name": "Title",
      "type": "Edm.String",
      "key": false,
      "searchable": true,
      "filterable": false,
      "sortable": false,
      "facetable": false,
      "retrievable": false,
      "analyzer": "en.lucene"
    },
    {
      "name": "Content",
      "type": "Edm.String",
      "key": false,
      "searchable": true,
      "filterable": false,
      "sortable": false,
      "facetable": false,
      "retrievable": false,
      "analyzer": "en.lucene"
    },
    {
      "name": "Categories",
      "type": "Collection(Edm.String)",
      "key": false,
      "searchable": true,
      "filterable": false,
      "sortable": false,
      "facetable": false,
      "retrievable": false,
      "analyzer": "en.lucene"
    },
    {
      "name": "IsPublished",
      "type": "Edm.Boolean",
      "key": false,
      "searchable": false,
      "filterable": true,
      "sortable": false,
      "facetable": false,
      "retrievable": false
    }
  ],
  "scoringProfiles": [],
  "suggesters": [{     "name": "Suggester",     "searchMode": "analyzingInfixMatching",     "sourceFields": ["Title", "Content"]  }]
}

```

This is the request body of the [Create Index](https://msdn.microsoft.com/en-us/library/azure/dn798941.aspx "Create Index API") API. A [.NET client library](http://www.nuget.org/packages/Microsoft.Azure.Search/) is available and you can use it to perform various actions against the search service (using `ISearchServiceClient`) and an index (using `ISearchIndexClient`).

```
private static void CreateIndex(ISearchServiceClient client, string indexName)
{
    var definition = new Index
    {
        Name = indexName,
        Fields = new List<Field>
                 {
                     new Field("Id", DataType.String) { IsKey = true },
                     new Field("Title", DataType.String, AnalyzerName.EnLucene) 
                     { 
                         IsSearchable = true, 
                         IsRetrievable = false 
                     },
                     new Field("Content", DataType.String, AnalyzerName.EnLucene)
                     { 
                         IsSearchable = true, 
                         IsRetrievable = false                      },
                     new Field("Categories", DataType.Collection(DataType.String), AnalyzerName.EnLucene)
                     {
                         IsSearchable = true,
                         IsRetrievable = false
                     },
                     new Field("IsPublished", DataType.Boolean) 
                     { 
                          IsFilterable = true, 
                          IsRetrievable = false }
                     },
        Suggesters = new List<Suggester>
                     {
                         new Suggester("Suggester", SuggesterSearchMode.AnalyzingInfixMatching, 
                               "Title", "Content")
                     }
    };

    client.Indexes.Create(definition);
}

```

For a blog post you need such fields as Id (uniquely identifies a post), post title and content, post categories and a flag identifying if a post was published or not. The flag is needed so unpublished posts can be ignored with a filter.

Field properties will of course depend on the application. In my example I’ve made only Id field retrievable, that is in the search result only Ids of posts will be returned which is enough as I will be able to get the rest of the post data directly from my storage if needed. Searchable property should be set to true on fields like Title, Content and Categories as I want to enable full text search over these fields. The only filterable field is IsPublished so I could exclude non-published posts. I don’t use sorting and facets which are useful in other types of applications.

Notice the language analyzer that’s set for searchable fields. By default Azure Search will use a generic [Lucene Standard Analyzer](http://lucene.apache.org/core/4_9_0/analyzers-common/index.html "Lucene Standard Analyzer") that’s capable of tokenizing and lowercasing strings. You can set language specific analyzers (for example, ‘en.lucene’ for English) that are capable of handling language specifics (removing trailing ‘s or [stop words](http://en.wikipedia.org/wiki/Stop_words "Stop words"), etc). Also current version allows you to set Microsoft's natural language processors (the same technology that is used by Microsoft Office and Bing) as language analyzers that provide even better handling of various specifics of more than 50 languages.

## Populating an index

There are two ways you can populate indexes:

1.  Setting up a data source and an [indexer](https://msdn.microsoft.com/en-us/library/azure/dn946891.aspx "Indexer REST API") and make the latter pull documents from the data source on a predefined schedule;
2.  Push documents yourself.

Currently data sources can be created for [Azure SQL](http://azure.microsoft.com/en-us/services/sql-database/) databases and [DocumentDB](http://azure.microsoft.com/en-us/services/documentdb/). As my blog uses neither of them for storing posts I’m going fall back to the data push mechanism by sending my newly created and updated posts to Azure Search with HTTP POST requests.

> Even though a list of currently supported data sources may seem limited you can always post your documents for indexing directly. It will require a little more effort from your side but the key point is you are not limited by supported data sources.

First of all I need a maintenance routine that would allow me to update all posts in batches. This will allow me to re-index my entire blog:

```
private static void UploadPosts(ISearchIndexClient client, List<Post> posts)
{
    Console.WriteLine("Uploading posts...");

    try
    {
        client.Documents.Index(IndexBatch.Create(posts.Select(IndexAction.Create)));
    }
    catch (IndexBatchException e)
    {
        Console.WriteLine(
            "Failed to index some of the documents: {0}",
            string.Join(", ", e.IndexResponse.Results.Where(r => !r.Succeeded).Select(r => r.Key)));
    }
}

```

```
POST https://<serviceName>.search.windows.net/indexes/test/docs/index?api-version=2015-02-28 HTTP/1.1
api-key: <your api key>
Content-Type: application/json

{
  "value": [
    {
      "@search.action": "upload",
      "Id": "00423ab7-1fff-48de-b8f8-35c3da14c83c",
      "Title": "Ouch! CallbackOnCollectedDelegate was detected.",
      "Content": " I was in the middle of refactoring of...",
      "Categories": [
        "Tips & Tricks"
      ],
      "IsPublished": true
    },
    {
      "@search.action": "upload",
      "Id": "0141eccb-54f8-457e-9ebb-618964850e39",
      "Title": "Bring your own DI container to ASP.NET 5",
      "Content": " As you probably know ASP.NET 5 uses...",
      "Categories": [
        "ASP.NET",
        "Dependency Injection"
      ],
      "IsPublished": true
    }]
}

```

And I need some façade to send newly created and updated posts to Azure Search:

```
internal class SearchService : ISearchService
{
    private readonly IConfiguration configuration;

    public SearchService(IConfiguration configuration)
    {
        this.configuration = configuration;
    }

    public void Index(Post post)
    {
        var document = new Document
                       {
                           { "Id", post.ID },
                           { "Title", post.Title },
                           { "Content", post.Content },
                           { "Categories", post.Categories },
                           { "IsPublished", post.IsPublished }
                       };

        var action = new IndexAction(document);
        Execute(action);
    }

    private static void Execute(IndexAction action)
    {
        var retryStrategy = 
            new Incremental(3, TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(2));
        var retryPolicy = 
            new RetryPolicy<SearchIndexErrorDetectionStrategy>(retryStrategy);

        retryPolicy.ExecuteAction(() => 
            IndexClient.Documents.Index(IndexBatch.Create(action)));
    }

    private static ISearchIndexClient IndexClient
    {
        get
        {
            return new SearchIndexClient(
                       configuration.Find["search:service"],
                       configuration.Find["search:index"],
                       new SearchCredentials(configuration.Find["search:key"]));
        }
    }

    private class SearchIndexErrorDetectionStrategy : ITransientErrorDetectionStrategy
    {
        public bool IsTransient(Exception ex)
        {
            return ex is IndexBatchException;
        }
    }
}

```

You can either use strongly typed documents or just generic `Dictionary<string, object>`. Note that at runtime you are better off implementing transient fault handling when communicating with remote services.

Whenever a post is deleted I have to remove it from the search index as well.

```
public void Delete(string postId)
{
    var document = new Document
                   {
                       { "Id", postId }
                   };

    var action = new IndexAction(IndexActionType.Delete, document);
    Execute(action);
}

```

```
POST https://<serviceName>.search.windows.net/indexes/test/docs/index?api-version=2015-02-28 HTTP/1.1
api-key: <your api key>
Content-Type: application/json

{
  "value": [
    {
      "@search.action": "delete",
      "Id": "00423ab7-1fff-48de-b8f8-35c3da14c83c"
    }]
}

```

## Performing a search

Now all we need is a little form containing a text box an a submit button. On the server just extract the search string from the request and use a façade method that could look something like this:

```
public IList<SearchResult> Search(string searchText)
{
    var parameters = new SearchParameters
    {
        SearchMode = SearchMode.All,
        HighlightFields = new List<string> { "Content" },
        HighlightPreTag = "<b>",
        HighlightPostTag = "</b>",
        Filter = "IsPublished eq true"
    };

    var result = IndexClient.Documents.Search(searchText, parameters);
    return result.StatusCode != HttpStatusCode.OK ? null : result.Results;
}

```

Noticed that I search over published posts and specify that all search terms should be matched. I also make use of the really cool highlighting feature when the response will include text excerpts containing search terms and the terms will be surrounded with tags that you specify. You can directly show these excerpts (if they are present in the response) in the search result view or a suggester box. If highlights are not present, you can always get the posts by Id and decide what to display in the search result view.

Let’s try to search for ‘cloud patterns’:

```
GET https://<serviceName>.search.windows.net/indexes/blog/docs?search=cloud%20patterns&$count=false&$filter=IsPublished%20eq%20true&highlight=Content&highlightPreTag=%3Cb%3E&highlightPostTag=%3C%2Fb%3E&searchMode=all&api-version=2015-02-28 HTTP/1.1
api-key: <your api key>

HTTP/1.1 200 OK
Content-Type: application/json; odata.metadata=none
Content-Length: 4262

{
    "value": [
    {
        "@search.score": 1.2004055,
        "@search.highlights": {
            "Content": ["I and my team have been using  Semantic Logging Application Block  (hereinafter SLAB) on our project where we create <b>cloud</b> services running on Azure.",
            "You can read up on advantages of semantic logging over traditional logging on the  <b>Patterns</b> &amp; Practices  site but for me it\u2019s utmost important to have consumable logs, that is the logs that are easy to parse and easy to find information you need."]
        },
        "Id": "4ac023af-ab6a-4a45-901a-7b15f98dfdf2"
    },
    {
        "@search.score": 1.0295184,
        "@search.highlights": {
            "Content": ["In my  previous post  I provided a sample implementation of the  Priority Queue <b>pattern</b>  that was multiplexing messages from several queues through a dispatcher to a limited number of worker threads.",
            "In fact, we are closer to the  original description  of the <b>pattern</b> where it is proposed to assign more \u2018horse power\u2019 to higher priority queues by marshaling them to worker roles running on VMs with higher spec."]
        },
        "Id": "3ba95ea5-116d-49fc-9aa0-505f32e69043"
    },
    {
        "@search.score": 0.9752442,
        "Id": "4569c252-184f-4bad-85cb-b5e340d80a11"
    }]
}

```

As you can see search results are ordered by the score and highlights may or may not be present so your rendering code should account for that.

## Resources

[Azure Search documentation](http://azure.microsoft.com/en-us/documentation/services/search/)  
[Azure Search Service REST API](https://msdn.microsoft.com/en-us/library/azure/dn798935.aspx)  
[Adding Microsoft Azure Search to Your Websites and Apps](http://www.microsoftvirtualacademy.com/training-courses/adding-microsoft-azure-search-to-your-websites-and-apps)