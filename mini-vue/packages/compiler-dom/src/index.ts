import { compile as baseCompile } from '@vue/compiler-core'

export function compile(template: string) {
	return baseCompile(template)
}
