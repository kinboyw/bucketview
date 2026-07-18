<template>
    <ul className="popup" v-for="menu in menus" :style="menuStyle">
      <li @click="handleMenuClick(menu)">
        <span className="icon" :class="menu.icon"></span>
        {{ menu.displayName }}
      </li>
    </ul>
</template>

<script lang="ts">
import { defineComponent, computed, onMounted, reactive, ref } from 'vue';

interface Menu {
  displayName: string;
  icon?: string;
  onClick?: Function;
}

export default defineComponent({
  name: 'ContextMenu',
  props: {
    record: {},
    menus: [],

  },
  components: {  },
  setup(props) {
    const handleMenuClick = (menu: Menu)=>{
      menu.onClick && menu.onClick()
    }

    const menuStyle = computed(() => {
      return `left: ${props.x - 2}px, top: ${props.y - 2}px`
    })
    return {
      handleMenuClick,
      menuStyle,
      ...props
    }
  }
});
</script>


<style>
@keyframes fadeIn {
	0% {
		transform: translateY(-25%);
	}
	50%{
		transform: translateY(4%);
	}
	65%{
		transform: translateY(-2%);
	}
	80%{
		transform: translateY(2%);
	}
	95%{
		transform: translateY(-1%);
	}
	100% {
		transform: translateY(0%);
	}
}

.popup {
  animation-name: fadeIn;
  animation-duration: 0.4s;
  background-clip: padding-box;
  background-color: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  left: 0px;
  list-style-type: none;
  margin: 0;
  outline: none;
  padding: 0;
  position: absolute;
  text-align: left;
  top: 0px;
  overflow: hidden;
  -webkit-box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.popup li {
  clear: both;
  color: rgba(0, 0, 0, 0.65);
  cursor: pointer;
  font-size: 14px;
  font-weight: normal;
  line-height: 22px;
  margin: 0;
  padding: 5px 12px;
  transition: all .3s;
  white-space: nowrap;
  -webkit-transition: all .3s;
}

.popup li:hover {
  background-color: #e6f7ff;
}

.popup li > i {
  margin-right: 8px;
}
</style>
