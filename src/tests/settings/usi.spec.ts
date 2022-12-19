import {
  duplicateEngineSetting,
  getUSIEngineOptionCurrentValue,
  mergeUSIEngineSetting,
  USIEngineSetting,
  USIEngineSettings,
} from "@/settings/usi";

describe("settings/usi", () => {
  it("getUSIEngineOptionCurrentValue", () => {
    expect(
      getUSIEngineOptionCurrentValue({
        name: "test",
        type: "spin",
        default: 5,
        min: 0,
        max: 10,
        vars: [],
        value: 8,
      })
    ).toBe(8);
    expect(
      getUSIEngineOptionCurrentValue({
        name: "test",
        type: "spin",
        default: 5,
        min: 0,
        max: 10,
        vars: [],
      })
    ).toBe(5);
    expect(
      getUSIEngineOptionCurrentValue({
        name: "test",
        type: "string",
        default: "foo",
        vars: [],
        value: "bar",
      })
    ).toBe("bar");
    expect(
      getUSIEngineOptionCurrentValue({
        name: "test",
        type: "string",
        default: "foo",
        vars: [],
      })
    ).toBe("foo");
    expect(
      getUSIEngineOptionCurrentValue({
        name: "test",
        type: "string",
        vars: [],
      })
    ).toBeUndefined();
    expect(getUSIEngineOptionCurrentValue(null)).toBeUndefined();
  });

  it("duplicateEngineSetting", () => {
    const src: USIEngineSetting = {
      uri: "dummy",
      name: "My Test Engine",
      defaultName: "Test Engine",
      author: "Author",
      path: "/foo/bar/baz",
      options: {
        foo: {
          name: "foo",
          type: "spin",
          default: 5,
          min: 0,
          max: 10,
          vars: [],
          value: 8,
        },
      },
    };
    const out = duplicateEngineSetting(src);
    expect(out.uri).toMatch(/^es:\/\/usi-engine\/.*$/);
    expect(out.name).toBe("My Test Engine のコピー");
    expect(out.defaultName).toBe("Test Engine");
    expect(out.author).toBe("Author");
    expect(out.path).toBe("/foo/bar/baz");
    expect(out.options).toStrictEqual({
      foo: {
        name: "foo",
        type: "spin",
        default: 5,
        min: 0,
        max: 10,
        vars: [],
        value: 8,
      },
    });
    expect(out.options !== src.options).toBeTruthy();
  });

  it("mergeUSIEngineSetting", () => {
    const lhs: USIEngineSetting = {
      uri: "uri-a",
      name: "name-a",
      defaultName: "default-name-a",
      author: "author-a",
      path: "path-a",
      options: {
        foo: {
          name: "name-foo-a",
          type: "spin",
          default: 5,
          min: 0,
          max: 20,
          vars: [],
          value: 8,
        },
      },
    };
    const rhs: USIEngineSetting = {
      uri: "uri-b",
      name: "name-b",
      defaultName: "default-name-b",
      author: "author-b",
      path: "path-b",
      options: {
        foo: {
          name: "name-foo-b",
          type: "spin",
          default: 10,
          min: 0,
          max: 25,
          vars: [],
          value: 15,
        },
      },
    };
    mergeUSIEngineSetting(lhs, rhs);
    expect(lhs).toStrictEqual({
      uri: "uri-b",
      name: "name-b",
      defaultName: "default-name-a",
      author: "author-a",
      path: "path-a",
      options: {
        foo: {
          name: "name-foo-a",
          type: "spin",
          default: 5,
          min: 0,
          max: 20,
          vars: [],
          value: 15,
        },
      },
    });
  });

  it("USIEngineSetting", () => {
    const settings = new USIEngineSettings(
      JSON.stringify({
        engines: {
          "es://usi-engine/a": {
            uri: "es://usi-engine/a",
            name: "Engine A",
            defaultName: "engine-a",
            author: "author-a",
            path: "path-a",
            options: {},
          },
        },
      })
    );
    settings.addEngine({
      uri: "es://usi-engine/b",
      name: "Engine B",
      defaultName: "engine-b",
      author: "author-b",
      path: "path-b",
      options: {},
    });
    expect(settings.hasEngine("es://usi-engine/a")).toBeTruthy();
    expect(settings.hasEngine("es://usi-engine/b")).toBeTruthy();
    expect(settings.hasEngine("es://usi-engine/c")).toBeFalsy();
    expect(
      (settings.getEngine("es://usi-engine/a") as USIEngineSetting).name
    ).toBe("Engine A");
    expect(
      (settings.getEngine("es://usi-engine/b") as USIEngineSetting).name
    ).toBe("Engine B");
    expect(settings.engineList).toHaveLength(2);
    expect(settings.engineList[0].name).toBe("Engine A");
    expect(settings.engineList[1].name).toBe("Engine B");
    expect(JSON.parse(settings.json).engines["es://usi-engine/a"].name).toBe(
      "Engine A"
    );
    expect(JSON.parse(settings.json).engines["es://usi-engine/a"].name).toBe(
      "Engine A"
    );
    expect(
      JSON.parse(settings.json).engines["es://usi-engine/c"]
    ).toBeUndefined();
    expect(JSON.parse(settings.jsonWithIndent)).toStrictEqual(
      JSON.parse(settings.json)
    );
    settings.updateEngine({
      uri: "es://usi-engine/a",
      name: "Engine A Updated",
      defaultName: "engine-a",
      author: "author-a",
      path: "path-a",
      options: {},
    });
    expect(
      (settings.getEngine("es://usi-engine/a") as USIEngineSetting).name
    ).toBe("Engine A Updated");
    expect(
      (settings.getEngine("es://usi-engine/b") as USIEngineSetting).name
    ).toBe("Engine B");
    settings.removeEngine("es://usi-engine/b");
    expect(settings.hasEngine("es://usi-engine/a")).toBeTruthy();
    expect(settings.hasEngine("es://usi-engine/b")).toBeFalsy();
  });
});
