/* =========================
   TRANS AUVERGNE VTC
   SCRIPT GLOBAL
========================= */


/* =========================
   THEME
========================= */


function changeTheme(theme){

    document.body.className = theme;

    localStorage.setItem(
        "theme",
        theme
    );

}


/* Chargement du thème */

window.addEventListener(
"DOMContentLoaded",
()=>{


    let theme =
    localStorage.getItem("theme")
    ||
    "dark";


    document.body.className =
    theme;



    let selector =
    document.getElementById(
        "themeSelector"
    );


    if(selector){

        selector.value =
        theme;

    }


});



/* =========================
   LOGOUT
========================= */


function logout(){


    fetch(
        "/logout",
        {
            credentials:"include"
        }
    )

    .then(()=>{


        window.location.href="/";


    })

    .catch(()=>{


        window.location.href="/";


    });


}



/* =========================
   MENU CATEGORIES
========================= */


function openCategory(){

    let select =
    document.getElementById(
        "category"
    );


    let content =
    document.getElementById(
        "content"
    );


    if(!select || !content)
        return;



    let value =
    select.value;



    content.innerHTML =
    `
    <div class="driver-card">

        <h2>
        📂 ${value}
        </h2>

        <p>
        Cette catégorie sera disponible prochainement.
        </p>

    </div>
    `;


}
