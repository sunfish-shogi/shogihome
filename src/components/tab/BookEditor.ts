import * as PIXI from "pixi.js";
import * as d3 from "d3";
import { Position } from "@/shogi";

export class BookEditor {
    stage = new PIXI.Container();
    context = new PIXI.Graphics();
    links = new PIXI.Graphics();
    moveTexts = new PIXI.Container();
    renderer: any;
    graph: any;
    simulation: any;
    tooltip = new Tooltip();

    constructor(width: number, height: number, graph: any) {
        this.renderer = PIXI.autoDetectRenderer(
            {
                width: width,
                height: height,
                antialias: true,
                // autoResize: true,
                resolution: 1,
                backgroundColor: 0x666666
            }
        );
        this.graph = JSON.parse(JSON.stringify(graph));
        // @ts-ignore
        this.stage.addChild(this.context);
        // @ts-ignore
        this.stage.addChild(this.links);

        this.graph.links.forEach((link: any) => {
            const text = new PIXI.Text(
                link.label,
                {
                    fontFamily: "Verdana",
                    fontSize: 8,
                    fill: 0xffffff,
                    align: "center",
                }
            );
            link.text = text;
            // @ts-ignore
            this.moveTexts.addChild(text);
        });
        // @ts-ignore
        this.stage.addChild(this.moveTexts);

        const color = (function () {
            const scale = d3.scaleOrdinal(d3.schemeCategory10);
            return (num: any) => parseInt(scale(num).slice(1), 16);
        })();

        this.graph.nodes.forEach((node: any) => {
            node.gfx = new PIXI.Graphics();
            node.gfx.lineStyle(1.5, 0xffffff);
            node.gfx.beginFill(color(node.group));
            if (node.label != "") {
                node.gfx.drawCircle(0, 0, 10);
            } else {
                node.gfx.drawCircle(0, 0, 5);
            }
            node.gfx.interactive = true;
            node.gfx.buttonMode = true;
            node.gfx.on("pointerover", () => this.pointerOver(node));
            node.gfx.on("pointerout", () => this.pointerOut(node));
            this.stage.addChild(node.gfx);
        });

        // d3 simulation
        this.simulation = d3.forceSimulation()
            .force("link", d3.forceLink().id((d: any) => d.id))
            .force("charge", d3.forceManyBody().strength(-10))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .on("tick", () => this.ticked());

        this.simulation
            .nodes(this.graph.nodes)
            .on("tick", () => this.ticked());
        this.simulation.force("link")
            .links(this.graph.links);

        // d3.drag

        d3.select(this.renderer.view)
            .call(
                d3.drag()
                    .container(this.renderer.view)
                    .subject((d: any) => this.simulation.find(d.x, d.y, 10))
                    .on("start", (e: any, d: any) => this.dragstarted(e, d))
                    .on("drag", (e: any, d: any) => this.dragged(e, d))
                    .on("end", (e: any, d: any) => this.dragended(e, d))
            );
    }

    render() {
        this.renderer.render(this.stage);
    }

    pointerOver(node: any) {
        this.tooltip.show(node);
        node.gfx.tint = 0x666666;
        this.render();
    }

    pointerOut(node: any) {
        this.tooltip.hide();
        node.gfx.tint = 0xFFFFFF;
        this.render();
    }

    ticked() {
        this.graph.nodes.forEach((node: any) => {
            const { x, y, gfx } = node;
            gfx.position = new PIXI.Point(x, y);
        });
        this.links.clear();
        this.links.alpha = 0.6;
        this.graph.links.forEach((link: any) => {
            const { source, target } = link;
            const linkWeight = 2;
            const linkColor = 0xffffff;
            this.links.lineStyle(linkWeight, linkColor);
            // 始点から終点までの線
            const x0 = source.x;
            const y0 = source.y;
            const x1 = target.x;
            const y1 = target.y;
            const dx = x1 - x0;
            const dy = y1 - y0;
            this.links.moveTo(x0, y0);
            this.links.lineTo(x1, y1);
            // 矢印を描画するかどうか
            const isdrawarrowhead = true;
            if (isdrawarrowhead) {
                // 矢印
                const r = 0.10; // 矢印の大きさ
                const c = 0.05;
                const cp = 0.65 + c;
                const cm = 0.65 - c;
                const xa = x0 + cp * dx;
                const ya = y0 + cp * dy;
                const xb = x0 + cm * dx;
                const yb = y0 + cm * dy;
                this.links.moveTo(xa, ya);
                this.links.lineTo(xb - r * dy, yb + r * dx);
                this.links.moveTo(xa, ya);
                this.links.lineTo(xb + r * dy, yb - r * dx);
            }
            const isdrawlabel = true;
            if (isdrawlabel) {
                const r2 = dx * dx + dy * dy;
                const c = 2;
                link.text.x = (x0 + x1) / 2 + c * dy / Math.sqrt(r2);
                link.text.y = (y0 + y1) / 2 - c * dx / Math.sqrt(r2);
            }
        });
        this.links.endFill();
        this.render();
    }

    dragstarted(e: any, d: any) {
        this.tooltip.hide();
        if (!e.active) {
            this.simulation
                .alphaTarget(0.3)
                .restart();
        }
        e.subject.fx = e.subject.x;
        e.subject.fy = e.subject.y;
    }

    dragged(e: any, d: any) {
        e.subject.fx = e.x;
        e.subject.fy = e.y;
    }

    dragended(e: any, d: any) {
        if (!e.active) {
            this.simulation.alphaTarget(0);
        }
        e.subject.fx = null;
        e.subject.fy = null;
    }
    get view() {
        return this.renderer.view;
    }

    addNode() {
        // add node to graph
    }
    removeNode() {
        // remove node from graph
    }
}

class Tooltip {
    dom = d3.select("body")
        .append("div")
        .attr(
            "style",
            `
            display: none;
            font-family: Verdana;
            font-size: 12px;
            position: absolute;
            padding: 0.5em;
            color: #fff;
            background-color: #333;
            z-index: +9;
        `
        );

    show(node: any) {
        const offset = document.querySelector("canvas")!.getBoundingClientRect();
        const sfenString = node.id;
        const position = Position.newBySFEN(`${sfenString} 1`);
        // const csaString = position.getSFEN;
        this.dom
            .text(sfenString)
            .style("display", "inline-block")
            .style("left", `${offset.x + node.x + 10}px`)
            .style("top", `${offset.y + node.y + 10}px`);
        // console.log(position);
        document.getElementById("sfen-string")!.innerText = position!.sfen;
    }

    hide() {
        this.dom
            .text("")
            .style("display", "none")
            .style("top", "-100px")
            .style("left", "-100px");
    }
}