//go:build ignore
// +build ignore

package main

import (
	"log"
	"net/http"

	"github.com/vugu/vugu/devutil"
)

var SomeAutoReloadIndexThing = devutil.DefaultAutoReloadIndex.Replace(
	"<!-- scripts -->",
	"<script src=\"/index.js\"></script>\n"+
		"<!-- scripts -->")

func main() {
	l := "127.0.0.1:8844"
	log.Printf("Starting HTTP Server at %q", l)

	wc := devutil.NewWasmCompiler().SetDir(".")
	mux := devutil.NewMux()
	mux.Match(devutil.NoFileExt, SomeAutoReloadIndexThing.Replace(
		`<!-- styles -->`,
		`<link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.4.1/css/bootstrap.min.css">`))
	mux.Exact("/main.wasm", devutil.NewMainWasmHandler(wc))
	mux.Exact("/wasm_exec.js", devutil.NewWasmExecJSHandler(wc))
	mux.Default(devutil.NewFileServer().SetDir("."))

	log.Fatal(http.ListenAndServe(l, mux))
}
