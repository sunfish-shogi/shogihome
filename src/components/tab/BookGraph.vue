<template>
    {{ name }}
    <br>
    <div id="bookEditor"></div>
    <br>
    <div id="sfen-string"></div>
</template>

<script lang="ts">
import { defineComponent, onMounted } from "vue";
// import * as PIXI from "pixi.js";
import { BookEditor } from "./BookEditor";
import { bookData } from "./bookData";
// document.getElementById("pixi")!.appendChild(pixiApp.view);

// 全体的に Vue の思想に BookEditor のデザインがうまく則っていない気がするのでどうにかする。
// https://vuejs.org/api/general.html#definecomponent
export default defineComponent({
    setup: () => {
        onMounted(() => {
            const bookEditor = new BookEditor(800, 600, bookData);
            document.getElementById("bookEditor")!.appendChild(bookEditor.view);;
            // const app = new PIXI.Application({
            //     width: 200,
            //     height: 200,
            //     background: 0xc17e3c,
            // });
            // // @ts-ignore: なぜかこのプロジェクト下だと appendChild が軒並み型エラーになる。
            // document.getElementById("pixi").appendChild(app.view);
        });
        return {
            name: "BookGraph",
        };
    },
});
</script>

<style>
#sfen-string {
    color: black;
}
</style>