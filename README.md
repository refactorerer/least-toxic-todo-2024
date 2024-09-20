# forget htmx – how to actually web dev in 2024

Yes, it's time again to discuss web technologies. I know that because it's always time. For whatever reason we just cannot stop talking about our web stacks. So here I go with my take: You don't need react, but you certainly also don't need htmx. At least we can all agree you do need Postgres, that seems to be most sane choice for all applications, because sqlite is really just for kid-stuff. So let's go and build a todo app. 

In the following guide we will use a stack that is starting to gain traction and, as I believe, is soon going to take over the web: Postgres + Go + Next.js. Combining Go and Next.js might seem a bit off at first, since Next.js is actually a fullstack framework. Nevertheless, many devs including me, have found a way to capitalize on the strenghts of both Go and Next.js and make these two great pieces of technology integrate perfectly with each other.

## The Next.js Part

Next.js is a fullstack framework by Vercel that is built on top of react, heavily utilizing react server components. It allows you to have your frontend component and it's backend logic at one place, both written in JS or TS, completely skipping the classic JSON API part. 

This is what our simple To Do list page looks like: 

```
export default function Home() {
  // Server Action
  async function create(formData: FormData) {
    'use server'
    
    console.log(formData);
    const title = formData.get('title')?.toString() || '[object Object]';

    return (
      <div>
      </div>
    )
  }
    
  console.log('server')

  const x = {
    items: ["whatever", "asdf"]//3000
  }

  return (
    <div data-obj={JSON.stringify(x)}>
      <form action={create}>
          <input type="text" name="title"></input>
        </form>
    </div>
  )
}

```

In the above `Home` component, we have a list of todos in the `x` object, which we are going to send down to the client in the returned `div` via the `data-obj` attribute, just as suggested in the next.js docs [here](https://nextjs.org/docs/app/building-your-application/data-fetching/fetching#fetching-data-on-the-server-with-the-fetch-api). 

We see that the component includes a server action `create`, which is being executed when the client does an HTTP POST on the `/` route. The client also needs to provide an action ID in the form data and the HTTP header, such that next.js can route the request to the `create` function. In this server action we are not doing much yet, only printing the parameters and returning an empty `div` back to the client. 

## The Go Frontend

Go supports compilation to [WASM](https://webassembly.org), so we are lucky enough to bring the power of Go to browser. There are plenty of options to create a Go frontend application, but we go for the [vugu](https://www.vugu.org/) library, one of the most stable ones. 

Let's have a quick look at the frontend component. It contains an html part on top, and a Go script part below that.  

```
<div>
    <main role="main" class="container text-center">
	
        <h1>todos:</h1>
        <div vg-for='c.Items'>
            <div>
                <span vg-content="value"></span>
            </div>
        </div>

    </main>
</div>

<script type="application/x-go">

type Root struct {
    NewTodo string
    Loading bool
    Items []string `vugu:"data"`
    actionId string
    url string
}

func ParseTodos(doc *html.Node) ([]string) {
    var res []string
    var crawler func(*html.Node)
    crawler = func(node *html.Node) {
        if node.Type == html.ElementNode && node.Data == "div" {
            for _, attr := range node.Attr {
                if attr.Key == "data-obj" {
                    var data map[string][]string
                    b := []byte(attr.Val)
                    _ = json.Unmarshal(b, &data)
                    res = data["items"]
                    return
                }
            }
        }
        for child := node.FirstChild; child != nil; child = child.NextSibling {
            crawler(child)
        }
    }
    crawler(doc)
    return res
}

func renderNode(n *html.Node) string {
    var buf bytes.Buffer
    w := io.Writer(&buf)
    html.Render(w, n)
    return buf.String()
}

func (c *Root) Init(ctx vugu.InitCtx) {

    c.Loading = true

    go func() {

        resp, err := http.Get(c.url)
        if err != nil {
            log.Printf("Error fetching: %v", err)
            return
        }
        defer resp.Body.Close()

        doc, _ := html.Parse(resp.Body)
        todos := ParseTodos(doc)

        c.Items = todos

        ctx.EventEnv().Lock()
        c.Loading = false
        ctx.EventEnv().UnlockRender()
    }()
}
    
</script>

```

In the html part of the component, we are iterating over the todo items with `vg-for` and rendering them into the DOM. The items are fetched in the `Root.Init` function in the `script` part of the component. We are parsing the html response of the next.js backend, and look for the div that contains the `data-obj` attribute and parse its JSON value into a Go map. Web development can be as easy as that!

## The Postgres Part

Of course this todo application is still missing a database to store our todos in. The obvious choice to achieve this, is making use of an in-memory postgres database that runs inside the browser. We can do that with the [pglitve](https://pglite.dev/) library, which also compiles to WASM. The database will be exposed as a global javascript variable, which we can then use in the Go frontend component. 

We only need to add this short piece of javascript: 
```
(() => {
  console.log("asdfasdfasdfsadf");

  import(
    "https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js"
  ).then((module) => {
    window.globalThis.pg = module;
  });
})();
```

In the root component we then get the `pg` variable and create the todo table:
```
pg := js.Global().Get("pg").Get("PGlite").New()
promise := pg.Call("exec", "CREATE TABLE IF NOT EXISTS todo (id SERIAL PRIMARY KEY, name TEXT)")
```

The `promise` Go variable now contains a javascript promise that we need to await, before continuing rendering the component. 

```
await(promise)
```

where the Go `await` function looks like this (this is not at all inspired by [this](https://stackoverflow.com/a/68427221)): 

```
func await(awaitable js.Value) ([]js.Value, []js.Value) {
	then := make(chan []js.Value)
	defer close(then)
	thenFunc := js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		then <- args
		return nil
	})
	defer thenFunc.Release()

	catch := make(chan []js.Value)
	defer close(catch)
	catchFunc := js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		catch <- args
		return nil
	})
	defer catchFunc.Release()

	awaitable.Call("then", thenFunc).Call("catch", catchFunc)

	select {
	case result := <-then:
		return result, nil
	case err := <-catch:
		return nil, err
	}
}
```

As soon as the frontend component has parsed the todo items from the next.js backend, we can import these in the browser-embedded postgres database like this: 

```
for _, todo := range todos {
	promise = pg.Call("exec", "insert into todo (name) values ('" + todo + "')")
	_, err := await(promise)
	if err != nil {
		js.Global().Get("console").Call("error", err[0])
	}
}
```

I tested every possible todo, there is no way that this is vulnerable to sql injection.

That's it, we got our todos in a database. The only thing missing is creating new todos and syncing the backend with the frontend. 

## Creating New Todos

This is where this stack will shine, and you'll shortly understand why we do all of this! 

The idea is simple: The user inputs the todo in the Go Frontend, which calls the next.js backend via a good old HTTP POST. But where does the backend store the item when the database is in the browser, you ask? In the code itself! Obviously. Let me explain: 

A next.js project is actually super simple to set up. It's one command and then another one to start the server – so it's easy to automate setting up a new project. Now take a look again at the backend snippet above: the todo items are already hardcoded in the backend. Therefore whenever a request is received on the server, we can simply generate a new next.js project, copy the source file of the home component over there, edit the hardcoded items to include the new item with some regex replacement thingy, and then spin up the new project on a different port, which will eventually be returned to the Go client, that rerenders itself using the newly deployed server as a backend. Easy as that!

Here is the updated server action handling the POST request:

```
async function create(formData: FormData) {
    'use server'
    
    console.log(formData);
    const title = formData.get('title')?.toString() || '[object Object]';

    const port = (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000) + 1;

    const pwd = "dir=$PWD"
    const cmd = "npx create-next-app@latest ${dir}_new --ts --tailwind --eslint --app --use-npm --src-dir --import-alias \"@/*\""
    const cpPage = "cp $dir/src/app/page.tsx ${dir}_new/src/app/page.tsx"
    const editData = "sed -i 's@]//" + (port - 1) + "@, \"" + title + "\"]//" + port + "@g' ${dir}_new/src/app/page.tsx"
    const cpConf = "cp $dir/next.config.mjs ${dir}_new/next.config.mjs"
    const cdToNew = "cd ${dir}_new"
    const startDevServer = "npm run dev -- --port " + port

    await new Promise((res) => {
      const child = c.spawn('bash')

      child.stdin.write(pwd + ' && ' + cmd + ' && ' + cpPage + ' && ' + editData + ' && ' + cpConf + ' && ' + cdToNew + ' && ' + startDevServer + '\n');
  
      child.stdout.on('data', data => {
        console.log(`stdout:\n${data}`);
        if((data as string).indexOf('http://localhost:' + port) != -1) {
          res(port);
        }
      });
      
      child.stderr.on('data', data => {
        console.error(`stderr: ${data}`);
      });
    });

    const result = {port};

    return (
      <div data-obj={result}>
        
      </div>
    )
  }
```

The Go client needs to read the given port from the response. A next.js server action does not return html, but something else that is more performant. Having a server return html is such a basic htmx idea anyway, so who needs that? But it doesn't matter, we just search for the port string via regex in the text response and then replace `window.location.href` with the new port as a query parameter, to reinitialize the app:

```
func (c *Root) HandleClick(event vugu.DOMEvent) {

    val := c.NewTodo
    c.NewTodo = ""

    go func() {
        form := url.Values{}
        form.Add("1_title", val)
        form.Add(fmt.Sprintf("1_%v", c.actionId), "")
        form.Add("0", "[\"$K1\"]")

        client := &http.Client{}
        req, _ := http.NewRequest("POST", c.url, strings.NewReader(form.Encode()))
				// necessary for the next backend to know which server action should be used :)
        req.Header.Add("Next-Action", strings.TrimPrefix(c.actionId, "$ACTION_ID_"))
        req.Header.Add("Content-Type", "application/x-www-form-urlencoded")

        resp, err := client.Do(req)
        if err != nil {
            fmt.Fprintf(os.Stderr, "%v\n", err)
            return
        }
        
        respBody, _ := ioutil.ReadAll(resp.Body)
        fmt.Fprintf(os.Stderr, "%v\n", string(respBody))

        var newPort string
        myExp := regexp.MustCompile(`\{(\"port\"\:)(?<port>\d*)\}`)
        match := myExp.FindStringSubmatch(string(respBody))
        for i, name := range myExp.SubexpNames() {
            if name == "port" {
                newPort = match[i]
            }
        }

        js.Global().Get("window").Get("location").Set("href", "http://localhost:8844?port=" + newPort)
        
        defer resp.Body.Close()
    }()

}
```

The advantages of this approach are endless, but here are some of them:
* You can travel back in time by putting a different port number into the port query parameter. Boom, time travel invented.

## Summary

The todo app is still missing some nice-to-have features, like marking todos as done. Although often discussed whether this is actually necessary, it might be a useful feature. It could be integrated into the stack by splitting the backend into microservices and have them communicate asynchronously via Apache Kafka. 

As you can see, there is absolutely no need for htmx in this example! All you need is an in-browser-memory postgres, a Go/WASM frontend application communicating with a next.js backend that you regenerate and restart everytime some piece of data changes. Easy as that!

/s on the whole thing, obviously. The thing is super stupid and I've wasted way too much time in making it work. But it does work. Please imagine the pirate movie meme to this sentence, I'm too tired, thanks. htmx ftw. 
