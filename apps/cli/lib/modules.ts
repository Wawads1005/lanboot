import { $ } from "zx";

const modules = ["target_core_mod", "target_core_iblock", "iscsi_target_mod"];

async function loadModules() {
  for (const module of modules) {
    console.log(`Loading ${module}...`);
    await $`modprobe ${module}`;
    console.log(`Successfully loaded ${module}.`);
  }
}

async function unloadModules() {
  for (const module of modules) {
    console.log(`Loading ${module}...`);
    await $`modprobe -r ${module}`;
    console.log(`Successfully loaded ${module}.`);
  }
}

export { loadModules, unloadModules };
