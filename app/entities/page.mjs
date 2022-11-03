function Page(name, contents){
	this.name = name ? name.replace(/\.\w+$/, '') : null
	this.contents = contents
}
export default Page