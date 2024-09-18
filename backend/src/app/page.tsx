import * as c from 'node:child_process'

export default function Home() {
  // Server Action
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
