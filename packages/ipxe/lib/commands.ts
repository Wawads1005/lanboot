import type {
  iPXEDrive,
  iPXENetworkInterface,
  iPXESetting,
  iPXESettingValue,
} from "@/lib/settings";

class iPXE {
  private newLine: undefined = undefined;

  constructor(
    readonly lines: Array<string | typeof this.newLine> = [
      "#!ipxe",
      this.newLine,
    ],
  ) {}

  /**
   * Adds a label and invokes a callback to define the commands that belong to the label.
   */
  label(label: string, commands: (ipxe: iPXE) => void) {
    const line: typeof this.lines = [this.newLine, `:${label}`];

    const ipxe = new iPXE(line);

    commands(ipxe);

    this.lines.push(...ipxe.lines);
  }

  /**
   * Appends the shell logical AND operator to the previously added command
   * and invokes a callback to define the commands to execute on success.
   */
  then(callback: (ipxe: iPXE) => iPXE) {
    const command = this.lines.pop();

    if (!command) {
      throw new Error("Command not found");
    }

    this.lines.push(`${command} \\`);

    callback(this);

    const next = this.lines.pop();

    if (!next) {
      throw new Error("Next command not found");
    }

    this.lines.push(`&& ${next}`);

    return this;
  }

  /**
   * Appends the shell logical OR operator to the previously added command
   * and invokes a callback to define the commands to execute on failure.
   */
  catch(callback: (ipxe: iPXE) => iPXE) {
    const command = this.lines.pop();

    if (!command) {
      throw new Error("Command not found");
    }

    this.lines.push(`${command} \\`);

    callback(this);

    const next = this.lines.pop();

    if (!next) {
      throw new Error("Next command not found");
    }

    this.lines.push(`|| ${next}`);

    return this;
  }

  /**
   * Builds the iPXE script by joining all generated lines with newline characters.
   */
  build() {
    this.lines.push(this.newLine);

    return this.lines.join("\n");
  }

  /** Display the state of the specified network interfaces. */
  ifstat(...network_interfaces: iPXENetworkInterface[]) {
    const line: string[] = ["ifstat"];

    line.push(...network_interfaces);

    this.lines.push(line.join(" "));

    return this;
  }

  /** Open the specified network interfaces. */
  ifopen(...network_interfaces: iPXENetworkInterface[]) {
    const line: string[] = ["ifopen"];

    line.push(...network_interfaces);

    this.lines.push(line.join(" "));

    return this;
  }

  /** Close the specified network interfaces. */
  ifclose(...network_interfaces: iPXENetworkInterface[]) {
    const line: string[] = ["ifclose"];

    line.push(...network_interfaces);

    this.lines.push(line.join(" "));

    return this;
  }

  /** Automatically configure a network interface. */
  ifconf(
    options: { timeout?: number; configurator?: "ipv6" | "dhcp" } = {},
    ...network_interfaces: iPXENetworkInterface[]
  ) {
    const line: string[] = ["ifconf"];

    if (options) {
      if (options.configurator) {
        line.push("--configurator", options.configurator);
      }

      if (options.timeout !== undefined) {
        line.push("--timeout", `${options.timeout}`);
      }
    }

    line.push(...network_interfaces);

    this.lines.push(line.join(" "));

    return this;
  }

  /** Wait for link-up on a network interface. */
  iflinkwait(
    options: { timeout?: number } = {},
    ...network_interfaces: iPXENetworkInterface[]
  ) {
    const line: string[] = ["iflinkwait"];

    if (options) {
      if (options.timeout !== undefined) {
        line.push("--timeout", `${options.timeout}`);
      }
    }

    line.push(...network_interfaces);

    this.lines.push(line.join(" "));

    return this;
  }

  /** Display the routing table. */
  route() {
    const line: string[] = ["route"];

    this.lines.push(line.join(" "));

    return this;
  }

  /** Display neighbour table. */
  nstat() {
    const line: string[] = ["nstat"];

    this.lines.push(line.join(" "));

    return this;
  }

  /** Display IP statistics. */
  ipstat() {
    const line: string[] = ["ipstat"];

    this.lines.push(line.join(" "));

    return this;
  }

  /** Create a VLAN network interface on an existing trunk network interface. */
  vcreate(
    options: { tag?: string; priority?: number } = {},
    trunk_network_interface: string,
  ) {
    const line: string[] = ["vcreate"];

    if (options) {
      if (options.tag) {
        line.push("--tag", options.tag);
      }

      if (options.priority !== undefined) {
        line.push("--priority", `${options.priority}`);
      }
    }

    line.push(trunk_network_interface);

    this.lines.push(line.join(" "));

    return this;
  }

  /** Destroy a VLAN network interface that was previously created using `vcreate`. */
  vdestroy(vlan_network_interface: string) {
    const line: string[] = ["vdestroy"];

    line.push(vlan_network_interface);

    this.lines.push(line.join(" "));

    return this;
  }

  /** Display information about the specified images. */
  imgstat(...names: string[]) {
    const line: string[] = ["imgstat"];

    line.push(...names);
    this.lines.push(line.join(" "));

    return this;
  }

  /** Download and boot an executable image from the specified URI. */
  imgexec(
    options: {
      name?: string;
      timeout?: number;
      autoFree?: boolean;
      replace?: boolean;
    } = {},
    uriOrImage?: string,
    ...args: string[]
  ) {
    const line: string[] = ["imgexec"];

    if (options) {
      if (options.name) {
        line.push("--name", options.name);
      }

      if (options.timeout !== undefined) {
        line.push("--timeout", `${options.timeout}`);
      }

      if (options.autoFree) {
        line.push("--autofree");
      }

      if (options.replace) {
        line.push("--replace");
      }
    }

    if (uriOrImage) {
      line.push(uriOrImage);
    }

    line.push(...args);

    this.lines.push(line.join(" "));

    return this;
  }

  /** Download an image from the specified URI. */
  imgfetch(
    options: { name?: string; timeout?: number } = {},
    uri: string,
    ...args: string[]
  ) {
    const line: string[] = ["imgfetch"];

    if (options) {
      if (options.name) {
        line.push("--name", options.name);
      }

      if (options.timeout !== undefined) {
        line.push("--timeout", `${options.timeout}`);
      }
    }

    line.push(uri);
    line.push(...args);

    this.lines.push(line.join(" "));

    return this;
  }

  /** Download and select an executable image from the specified URI. */
  imgload(
    options: { name?: string; timeout?: number } = {},
    uriOrImage: string,
    ...args: string[]
  ) {
    const line: string[] = ["imgload"];

    if (options) {
      if (options.name) {
        line.push("--name", options.name);
      }

      if (options.timeout !== undefined) {
        line.push("--timeout", `${options.timeout}`);
      }
    }

    line.push(uriOrImage);
    line.push(...args);

    this.lines.push(line.join(" "));

    return this;
  }

  /** Discard the specified image. */
  imgfree(image?: string) {
    const line: string[] = ["imgfree"];

    if (image) {
      line.push(image);
    }

    this.lines.push(line.join(" "));

    return this;
  }

  /** Set command-line arguments to be passed to the specified image. */
  imgargs(
    options: { name?: string } = {},
    uriOrImage: string,
    ...args: string[]
  ) {
    const line: string[] = ["imgargs"];

    if (options) {
      if (options.name) {
        line.push("--name", options.name);
      }
    }

    line.push(uriOrImage);
    line.push(...args);

    this.lines.push(line.join(" "));

    return this;
  }

  /** Download an image and set the value of the specified configuration setting to its contents. */
  imgset(
    options: { timeout?: number; keep?: boolean } = {},
    setting: string,
    uriOrImage: string,
  ) {
    const line: string[] = ["imgset"];

    if (options) {
      if (options.timeout !== undefined) {
        line.push("--timeout", `${options.timeout}`);
      }

      if (options.keep) {
        line.push("--keep");
      }
    }

    line.push(setting);
    line.push(uriOrImage);

    this.lines.push(line.join(" "));

    return this;
  }

  /** Attach the specified SAN target URIs as the specified SAN drive. */
  sanhook(
    options: { drive?: iPXEDrive; noDescribe?: boolean } = {},
    ...uris: string[]
  ) {
    const line: string[] = ["sanhook"];

    if (options) {
      if (options.drive) {
        line.push("--drive", options.drive);
      }

      if (options.noDescribe) {
        line.push("--no-describe");
      }
    }

    line.push(...uris);

    this.lines.push(line.join(" "));

    return this;
  }

  /** Boot from the specified SAN drive. */
  sanboot(
    options: {
      drive?: iPXEDrive;
      filename?: string;
      extra?: string;
      label?: string;
      uuid?: string;
      noDescribe?: boolean;
      keep?: boolean;
    } = {},
    ...uris: string[]
  ) {
    const line: string[] = ["sanboot"];

    if (options) {
      if (options.drive) {
        line.push("--drive", options.drive);
      }

      if (options.filename) {
        line.push("--filename", options.filename);
      }

      if (options.extra) {
        line.push("--extra", options.extra);
      }

      if (options.label) {
        line.push("--label", options.label);
      }

      if (options.uuid) {
        line.push("--uuid", options.uuid);
      }

      if (options.noDescribe) {
        line.push("--no-describe");
      }

      if (options.keep) {
        line.push("--keep");
      }
    }

    line.push(...uris);

    this.lines.push(line.join(" "));
    return this;
  }

  /** Detach the specified SAN drive. */
  sanunhook(options: { drive?: iPXEDrive } = {}) {
    const line: string[] = ["sanunhook"];

    if (options) {
      if (options.drive) {
        line.push("--drive", options.drive);
      }
    }

    this.lines.push(line.join(" "));
    return this;
  }

  /** Display the state of all Fibre Channel ports. */
  fcstat() {
    const line: string[] = ["fcstat"];

    this.lines.push(line.join(" "));
    return this;
  }

  /** Issue the specified Fibre Channel ELS request to the specified peer port ID via the specified Fibre Channel port. */
  fcels(
    options: { port?: number; id?: string } = {},
    request: "flogi" | "plogi" | "prli-fcp" | "logo" | "echo",
  ) {
    const line: string[] = ["fcels"];

    if (options) {
      if (options.port !== undefined) {
        line.push("--port", `${options.port}`);
      }

      if (options.id) {
        line.push("--id", options.id);
      }
    }

    line.push(request);

    this.lines.push(line.join(" "));
    return this;
  }

  /** Start the interactive configuration tool to edit configuration settings in the specified scope. */
  config(scope?: string) {
    const line: string[] = ["config"];

    if (scope) {
      line.push(scope);
    }

    this.lines.push(line.join(" "));
    return this;
  }

  /** Display value of the specified configuration setting. */
  show(options: { quiet?: boolean } = {}, setting: iPXESetting) {
    const line: string[] = ["show"];

    if (options) {
      if (options.quiet) {
        line.push("--quiet");
      }
    }

    line.push(setting);

    this.lines.push(line.join(" "));
    return this;
  }

  /** Set value of the specified configuration setting to the specified value. */
  set<T extends iPXESetting>(setting: T, value: iPXESettingValue<T>): this {
    const line = ["set", setting, `${value}`];

    this.lines.push(line.join(" "));
    return this;
  }

  setVariable(variable: string, value: string | number): this {
    const line = ["set", variable, `${value}`];

    this.lines.push(line.join(" "));
    return this;
  }

  /** Delete the specified configuration setting. */
  clear(setting: iPXESetting): this {
    const line = ["clear", setting];

    this.lines.push(line.join(" "));
    return this;
  }

  clearVariable(variable: string): this {
    const line = ["clear", variable];

    this.lines.push(line.join(" "));
    return this;
  }

  /** Set value of the specified configuration setting to the value provided by the user. */
  read(options: { timeout?: number } = {}, setting: iPXESetting) {
    const line: string[] = ["read"];

    if (options.timeout !== undefined) {
      line.push("--timeout", `${options.timeout}`);
    }

    line.push(setting);

    this.lines.push(line.join(" "));
    return this;
  }

  /** Increment the numeric value of the specified configuration setting by the specified increment amount. */
  inc(setting: iPXESetting, increment?: number) {
    const line: string[] = ["inc"];

    line.push(setting);

    if (increment !== undefined) {
      line.push(`${increment}`);
    }

    this.lines.push(line.join(" "));

    return this;
  }

  /** Display a login screen and allow the user to enter a user name and the corresponding password. */
  login() {
    const line: string[] = ["login"];

    this.lines.push(line.join(" "));
    return this;
  }

  /** Test existence of the specified value, which will normally be a configuration setting. */
  isset(settingOrVariable: string) {
    const line: string[] = ["isset"];

    line.push(settingOrVariable);

    this.lines.push(line.join(" "));
    return this;
  }

  /** Test equality of the two specified values, at least one of which will normally be a configuration setting. */
  iseq(value1: string | number, value2: string | number) {
    const line: string[] = ["iseq"];

    line.push(`${value1}`, `${value2}`);

    this.lines.push(line.join(" "));

    return this;
  }

  /** Jump to a script label. This command can be used only within an iPXE script. */
  goto(label: string) {
    const line: string[] = ["goto"];

    line.push(label);

    this.lines.push(line.join(" "));

    return this;
  }

  /** Exit the iPXE shell, or the currently running script. */
  exit(status?: number) {
    const line: string[] = ["exit"];

    if (status !== undefined) {
      line.push(`${status}`);
    }

    this.lines.push(line.join(" "));

    return this;
  }

  /** Create a menu with the specified name and title. */
  menu(options: { name?: string; delete?: boolean } = {}, title?: string) {
    const line: string[] = ["menu"];

    if (options) {
      if (options.name) {
        line.push("--name", options.name);
      }

      if (options.delete) {
        line.push("--delete");
      }
    }

    if (title) {
      line.push(title);
    }

    this.lines.push(line.join(" "));

    return this;
  }

  /** Create an interactive form with the specified name and title. */
  form(options: { name?: string; delete?: boolean } = {}, title?: string) {
    const line: string[] = ["form"];

    if (options) {
      if (options.name) {
        line.push("--name", options.name);
      }

      if (options.delete) {
        line.push("--delete");
      }
    }

    if (title) {
      line.push(title);
    }

    this.lines.push(line.join(" "));

    return this;
  }

  /** Add a menu item or form item with the specified name and display text. */
  item(
    options:
      | {
          menu?: string;
          key?: string;
          default?: boolean;
          gap?: boolean;
        }
      | {
          form?: string;
          key?: string;
          default?: boolean;
          secret?: boolean;
          gap?: boolean;
        } = {},
    name?: string,
    text?: string,
  ) {
    const line: string[] = ["item"];

    if ("menu" in options && options.menu !== undefined) {
      line.push("--menu", options.menu);
    }

    if ("form" in options && options.form !== undefined) {
      line.push("--form", options.form);
    }

    if ("secret" in options && options.secret) {
      line.push("--secret");
    }

    if (options.key !== undefined) {
      line.push("--key", options.key);
    }

    if (options.default) {
      line.push("--default");
    }

    if (options.gap) {
      line.push("--gap");
    }

    if (name !== undefined) {
      line.push(name);
    }

    if (text !== undefined) {
      line.push(text);
    }

    this.lines.push(line.join(" "));
    return this;
  }

  /** Choose an item from a menu and store the result in the specified setting. */
  choose(
    options: {
      menu?: string;
      default?: string;
      keep?: boolean;
      timeout?: number;
      retimeout?: number;
    } = {},
    label: string,
  ) {
    const line: string[] = ["choose"];

    if (options) {
      if (options.menu) {
        line.push("--menu", options.menu);
      }

      if (options.default) {
        line.push("--default", options.default);
      }

      if (options.keep) {
        line.push("--keep");
      }

      if (options.timeout !== undefined) {
        line.push("--timeout", `${options.timeout}`);
      }

      if (options.retimeout !== undefined) {
        line.push("--retimeout", `${options.retimeout}`);
      }
    }

    line.push(label);

    this.lines.push(line.join(" "));

    return this;
  }

  /** Display an interactive form and store the resulting value in the specified setting for each form item. */
  present(options: { form?: string; keep?: boolean } = {}) {
    const line: string[] = ["present"];

    if (options) {
      if (options.form) {
        line.push("--form", options.form);
      }

      if (options.keep) {
        line.push("--keep");
      }
    }

    this.lines.push(line.join(" "));

    return this;
  }

  /** Display details of the specified certificates in the certificate store. */
  certstat(options: { subject?: string } = {}) {
    const line: string[] = ["certstat"];

    if (options) {
      if (options.subject) {
        line.push("--subject", options.subject);
      }
    }

    this.lines.push(line.join(" "));

    return this;
  }

  /** Add the specified certificates to the certificate store. */
  certstore(options: { subject?: string; keep?: boolean } = {}, uri?: string) {
    const line: string[] = ["certstore"];

    if (options) {
      if (options.subject) {
        line.push("--subject", options.subject);
      }

      if (options.keep) {
        line.push("--keep");
      }
    }

    if (uri) {
      line.push(uri);
    }

    this.lines.push(line.join(" "));

    return this;
  }

  /** Discard the specified certificates from the certificate store. */
  certfree(options: { subject?: string } = {}) {
    const line: string[] = ["certfree"];

    if (options) {
      if (options.subject) {
        line.push("--subject", options.subject);
      }
    }

    this.lines.push(line.join(" "));

    return this;
  }

  /** Configure the console with the specified width, height, margins, colour depth, and background picture. */
  console(
    options: {
      x?: number;
      y?: number;
      left?: number;
      right?: number;
      top?: number;
      bottom?: number;
      depth?: number;
      picture?: string;
      keep?: boolean;
    } = {},
  ) {
    const line: string[] = ["console"];

    if (options) {
      if (options.x !== undefined) {
        line.push("--x", `${options.x}`);
      }

      if (options.y !== undefined) {
        line.push("--y", `${options.y}`);
      }

      if (options.left !== undefined) {
        line.push("--left", `${options.left}`);
      }

      if (options.right !== undefined) {
        line.push("--right", `${options.right}`);
      }

      if (options.top !== undefined) {
        line.push("--top", `${options.top}`);
      }

      if (options.bottom !== undefined) {
        line.push("--bottom", `${options.bottom}`);
      }

      if (options.depth !== undefined) {
        line.push("--depth", `${options.depth}`);
      }

      if (options.picture) {
        line.push("--picture", options.picture);
      }

      if (options.keep) {
        line.push("--keep");
      }
    }

    this.lines.push(line.join(" "));
    return this;
  }

  /** Define the specified colour index to use the specified basic ANSI colour and 24-bit RGB colour. */
  colour(
    options: {
      basic?: number;
      rgb?: number;
    } = {},
    colour: number,
  ) {
    const line: string[] = ["colour"];

    if (options.basic !== undefined) {
      line.push("--basic", `${options.basic}`);
    }

    if (options.rgb !== undefined) {
      line.push("--rgb", `0x${options.rgb.toString(16).padStart(6, "0")}`);
    }

    line.push(`${colour}`);

    this.lines.push(line.join(" "));
    return this;
  }

  /** Define the specified colour pair index to use the specified foreground and background colour indexes. */
  cpair(
    options: {
      foreground?: number;
      background?: number;
    } = {},
    pair: number,
  ) {
    const line: string[] = ["cpair"];

    if (options.foreground !== undefined) {
      line.push("--foreground", `${options.foreground}`);
    }

    if (options.background !== undefined) {
      line.push("--background", `${options.background}`);
    }

    line.push(`${pair}`);

    this.lines.push(line.join(" "));
    return this;
  }

  /** Create a request parameter list with the specified name. If no name is specified, the default (unnamed) request parameter list will be created. */
  params(
    options: {
      name?: string;
      method?: string;
      delete?: boolean;
    } = {},
  ) {
    const line: string[] = ["params"];

    if (options.name) {
      line.push("--name", options.name);
    }

    if (options.method) {
      line.push("--method", options.method);
    }

    if (options.delete) {
      line.push("--delete");
    }

    this.lines.push(line.join(" "));

    return this;
  }

  /** Add a request parameter with the specified key/value pair. */
  param(
    options: {
      params?: string;
      header?: boolean;
    } = {},
    key: string,
    value: string,
  ) {
    const line: string[] = ["param"];

    if (options.params) {
      line.push("--params", options.params);
    }

    if (options.header) {
      line.push("--header");
    }

    line.push(key, value);

    this.lines.push(line.join(" "));

    return this;
  }

  /** Print text to the console. */
  echo(options: { n?: boolean } = {}, text: string) {
    const line: string[] = ["echo"];

    if (options) {
      if (options.n) {
        line.push("-n");
      }
    }

    line.push(text);

    this.lines.push(line.join(" "));
    return this;
  }

  /** Prompt the user to press a key, displaying the specified text and waiting for the specified timeout. */
  prompt(options: { key?: string; timeout?: number } = {}, text: string) {
    const line: string[] = ["prompt"];

    if (options) {
      if (options.key) {
        line.push("--key", options.key);
      }

      if (options.timeout !== undefined) {
        line.push("--timeout", `${options.timeout}`);
      }
    }

    line.push(text);

    this.lines.push(line.join(" "));

    return this;
  }

  /** Display list of available commands. */
  help() {
    const line: string[] = ["help"];

    this.lines.push(line.join(" "));
    return this;
  }

  /** Do nothing for the specified number of seconds. */
  sleep(seconds: number) {
    const line: string[] = ["sleep"];

    line.push(`${seconds}`);

    this.lines.push(line.join(" "));

    return this;
  }

  /** Start a new interactive shell, allowing the user to enter commands at the iPXE command line. */
  shell() {
    const line: string[] = ["shell"];

    this.lines.push(line.join(" "));

    return this;
  }

  /** Reboot the system immediately. */
  reboot() {
    const line: string[] = ["reboot"];

    this.lines.push(line.join(" "));

    return this;
  }

  /** Power off the system immediately. */
  poweroff() {
    const line: string[] = ["poweroff"];

    this.lines.push(line.join(" "));

    return this;
  }

  /** Check for the existence of the specified x86 CPU feature using the CPUID instruction. */
  cpuid(options: { ext?: boolean; ecx?: boolean } = {}, number: number) {
    const line: string[] = ["cpuid"];

    if (options) {
      if (options.ext) {
        line.push("--ext");
      }

      if (options.ecx) {
        line.push("--ecx");
      }
    }

    line.push(`${number}`);

    this.lines.push(line.join(" "));
    return this;
  }

  /** Wait for any background operations to complete. */
  sync(options: { timeout?: number } = {}) {
    const line: string[] = ["sync"];

    if (options) {
      if (options.timeout !== undefined) {
        line.push("--timeout", `${options.timeout}`);
      }
    }

    this.lines.push(line.join(" "));
    return this;
  }

  /** Set value of the specified configuration setting to the network address corresponding to the specified host name. */
  nslookup(setting: iPXESetting, hostname: string) {
    const line: string[] = ["nslookup"];

    line.push(setting, hostname);

    this.lines.push(line.join(" "));
    return this;
  }

  /** Check network connectivity to the specified host using ICMP ECHO packets. */
  ping(
    options: { size?: number; timeout?: number; count?: number } = {},
    host: string,
  ) {
    const line: string[] = ["ping"];

    if (options) {
      if (options.size !== undefined) {
        line.push("--size", `${options.size}`);
      }

      if (options.timeout !== undefined) {
        line.push("--timeout", `${options.timeout}`);
      }

      if (options.count !== undefined) {
        line.push("--count", `${options.count}`);
      }
    }

    line.push(host);

    this.lines.push(line.join(" "));
    return this;
  }

  /** Get the time and date from a Network Time Protocol (NTP) server. */
  ntp(host: string) {
    const line: string[] = ["ntp"];

    line.push(host);

    this.lines.push(line.join(" "));
    return this;
  }

  /** Scan the PCI bus, starting from the PCI bus:dev.fn address in the specified setting. */
  pciscan(setting: string) {
    const line: string[] = ["pciscan"];

    line.push(setting);

    this.lines.push(line.join(" "));
    return this;
  }

  /** Scan the USB bus, starting from the USB bus:dev address in the specified setting. */
  usbscan(setting: string) {
    const line: string[] = ["usbscan"];

    line.push(setting);

    this.lines.push(line.join(" "));
    return this;
  }
}

export { iPXE };
